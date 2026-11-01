const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { createClient } = require('@libsql/client')
const { createApp } = require('../app')
const { createTursoAdapter, migrateTurso, splitMigrationStatements } = require('../database/turso')
const { createDatabase } = require('../database')
const { migrateSqliteToTurso, TABLES, assertTargetEmpty } = require('../scripts/migrateSqliteToTurso')

test('Turso schema splitting keeps trigger bodies intact', () => {
  const directory = path.join(__dirname, '..', 'database', 'migrations')
  const schema = fs.readFileSync(path.join(directory, '003_topic_completion_history.sql'), 'utf8')
  const statements = splitMigrationStatements(schema)
  const triggers = statements.filter((statement) => /^\s*CREATE\s+TRIGGER\b/i.test(statement))
  assert.equal(triggers.length, 2)
  assert.equal(triggers.every((statement) => /INSERT INTO topic_completion_history/.test(statement)), true)
})

test('data transfer refuses a populated Turso target without deleting existing rows', async () => {
  const client = createClient({ url: ':memory:' })
  try {
    await client.execute('CREATE TABLE subjects (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
    await client.execute({ sql: 'INSERT INTO subjects (id, name) VALUES (?, ?)', args: [23, 'Existing data'] })
    await assert.rejects(assertTargetEmpty(client), /refusing to import/)
    const result = await client.execute('SELECT id, name FROM subjects')
    assert.equal(result.rows[0].id, 23)
    assert.equal(result.rows[0].name, 'Existing data')
  } finally {
    await client.close()
  }
})

test('health reports database initialization failures as JSON 503 instead of success', async (context) => {
  const unavailable = new Error('redacted underlying database failure')
  unavailable.code = 'DATABASE_UNAVAILABLE'
  const server = createApp(() => Promise.reject(unavailable)).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`)
  assert.equal(response.status, 503)
  assert.match(response.headers.get('content-type'), /application\/json/)
  assert.equal((await response.json()).error.code, 'DATABASE_UNAVAILABLE')
})

test('async libSQL adapter initializes schema and serves core API operations', async (context) => {
  const client = createClient({ url: ':memory:' })
  const db = createTursoAdapter(client)
  const previousCorsOrigins = process.env.CORS_ORIGINS
  process.env.CORS_ORIGINS = 'https://studysignal.example'
  const app = createApp(db)
  if (previousCorsOrigins === undefined) delete process.env.CORS_ORIGINS
  else process.env.CORS_ORIGINS = previousCorsOrigins
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`

  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await db.close()
  })

  await migrateTurso(client)
  const health = await fetch(`${baseUrl}/health`, { headers: { Origin: 'https://studysignal.example' } })
  assert.equal(health.status, 200)
  assert.equal(health.headers.get('access-control-allow-origin'), 'https://studysignal.example')
  assert.equal((await health.json()).data.database, 'connected')
  const preflight = await fetch(`${baseUrl}/subjects`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://studysignal.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://studysignal.example')
  const blockedOrigin = await fetch(`${baseUrl}/health`, { headers: { Origin: 'https://other.example' } })
  assert.equal(blockedOrigin.headers.get('access-control-allow-origin'), null)

  const subjectResponse = await fetch(`${baseUrl}/subjects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'LibSQL biology', semester: 'Fall' }),
  })
  assert.equal(subjectResponse.status, 201)
  const subject = (await subjectResponse.json()).data
  const unitResponse = await fetch(`${baseUrl}/units`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subject_id: subject.id, title: 'Cell biology', position: 0 }),
  })
  assert.equal(unitResponse.status, 201)
  const unit = (await unitResponse.json()).data

  const topicResponse = await fetch(`${baseUrl}/topics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ unit_id: unit.id, title: 'Cell structure', status: 'COMPLETED' }),
  })
  assert.equal(topicResponse.status, 201)
  const topic = (await topicResponse.json()).data
  assert.equal(topic.status, 'COMPLETED')
  assert.equal((await (await fetch(`${baseUrl}/subjects/progress`)).json()).data[0].completed_topics, 1)

  const forecastResponse = await fetch(`${baseUrl}/forecast?date=2026-11-01`)
  assert.equal(forecastResponse.status, 200)
  const invalidParentResponse = await fetch(`${baseUrl}/topics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ unit_id: 99999, title: 'Invalid parent' }),
  })
  assert.equal(invalidParentResponse.status, 409)

  await migrateTurso(client)
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM topics').get()).count, 1)
  assert.equal(topic.id > 0, true)
  assert.equal((await forecastResponse.json()).data.forecasts.length, 1)
})

test('SQLite-to-libSQL migration preserves history and verifies all tables without altering source', async (context) => {
  const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'studysignal-transfer-'))
  const sourcePath = path.join(directory, 'source.sqlite')
  const backupPath = path.join(directory, 'source.backup.sqlite')
  const source = createDatabase(sourcePath)
  const subjectId = Number(source.prepare('INSERT INTO subjects (name, semester, created_at) VALUES (?, ?, ?)').run(
    'Transfer biology', 'Fall', '2026-10-01T10:00:00.000Z',
  ).lastInsertRowid)
  const unitId = Number(source.prepare('INSERT INTO units (subject_id, title) VALUES (?, ?)').run(subjectId, 'Cells').lastInsertRowid)
  const topicId = Number(source.prepare(`
    INSERT INTO topics (unit_id, title, status, completed_at) VALUES (?, ?, 'COMPLETED', ?)
  `).run(unitId, 'Membranes', '2026-10-30').lastInsertRowid)
  const habitId = Number(source.prepare('INSERT INTO habits (name) VALUES (?)').run('Transfer habit').lastInsertRowid)
  source.prepare('INSERT INTO habit_logs (habit_id, log_date, completed) VALUES (?, ?, 1)').run(habitId, '2026-10-30')
  source.prepare(`
    INSERT INTO study_plans (topic_id, plan_date, planned_minutes) VALUES (?, ?, ?)
  `).run(topicId, '2026-10-30', 45)
  source.prepare(`
    INSERT INTO study_sessions (topic_id, started_at, ended_at, duration_minutes, session_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(topicId, '2026-10-30T10:00:00.000Z', '2026-10-30T10:45:00.000Z', 45, '2026-10-30')
  source.prepare(`
    INSERT INTO topic_assessments (topic_id, quiz_score, recall_score, created_at)
    VALUES (?, ?, ?, ?)
  `).run(topicId, 88, 76, '2026-10-30T11:00:00.000Z')
  source.prepare('INSERT INTO revision_tasks (topic_id, due_date) VALUES (?, ?)').run(topicId, '2026-11-02')
  source.close()

  const targetClient = createClient({ url: ':memory:' })
  context.after(async () => {
    await targetClient.close()
    fs.rmSync(directory, { recursive: true, force: true })
  })

  const result = await migrateSqliteToTurso({
    sourcePath,
    backupPath,
    url: ':memory:',
    targetClient,
  })
  assert.equal(result.backupPath, backupPath)
  assert.deepEqual(result.rowCounts, Object.fromEntries(TABLES.map((table) => [table, 1])))
  assert.equal((await targetClient.execute('SELECT id, created_at FROM subjects')).rows[0].id, subjectId)
  assert.equal((await targetClient.execute('SELECT started_at, duration_minutes FROM study_sessions')).rows[0].duration_minutes, 45)
  assert.equal((await targetClient.execute('SELECT quiz_score, created_at FROM topic_assessments')).rows[0].created_at, '2026-10-30T11:00:00.000Z')

  const sourceCheck = new (require('better-sqlite3'))(sourcePath, { readonly: true })
  assert.equal(sourceCheck.prepare('SELECT COUNT(*) AS count FROM habit_logs').get().count, 1)
  sourceCheck.close()
})
