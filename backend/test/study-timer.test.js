const assert = require('node:assert/strict')
const test = require('node:test')
const { createDatabase } = require('../database')
const { createApp } = require('../app')
const {
  getActiveTimer,
  startTimer,
  pauseTimer,
  resumeTimer,
  completeTimer,
  discardTimer,
} = require('../services/studyTimerService')

function createTopic(db) {
  const subjectId = db.prepare('INSERT INTO subjects (name, semester) VALUES (?, ?)').run('Timer subject', 'Fall').lastInsertRowid
  const unitId = db.prepare('INSERT INTO units (subject_id, title) VALUES (?, ?)').run(subjectId, 'Timer unit').lastInsertRowid
  return Number(db.prepare('INSERT INTO topics (unit_id, title) VALUES (?, ?)').run(unitId, 'Timer topic').lastInsertRowid)
}

test('timer state persists, restores elapsed time, pauses, resumes, completes once, and leaves topic status unchanged', async (context) => {
  const db = createDatabase(':memory:')
  const topicId = createTopic(db)
  context.after(() => db.close())

  const started = await startTimer(db, { topic_id: topicId, session_date: '2026-11-01' }, new Date('2026-11-01T10:00:00.000Z'))
  assert.equal(started.status, 'RUNNING')
  assert.equal((await getActiveTimer(db, new Date('2026-11-01T10:12:34.000Z'))).current_elapsed_seconds, 754)

  const paused = await pauseTimer(db, started.id, new Date('2026-11-01T10:12:34.000Z'))
  assert.equal(paused.status, 'PAUSED')
  assert.equal(paused.elapsed_seconds, 754)
  assert.equal((await getActiveTimer(db, new Date('2026-11-01T11:00:00.000Z'))).current_elapsed_seconds, 754)

  const resumed = await resumeTimer(db, started.id, new Date('2026-11-01T11:00:00.000Z'))
  assert.equal(resumed.status, 'RUNNING')
  assert.equal((await getActiveTimer(db, new Date('2026-11-01T11:05:00.000Z'))).current_elapsed_seconds, 1054)

  const completed = await completeTimer(db, started.id, new Date('2026-11-01T11:05:00.000Z'))
  assert.equal(completed.status, 'COMPLETED')
  assert.equal(completed.duration_minutes, 18)
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM study_sessions').get()).count, 1)
  assert.equal((await db.prepare('SELECT duration_minutes FROM study_sessions WHERE timer_session_id = ?').get(started.id)).duration_minutes, 18)
  assert.equal((await db.prepare('SELECT status FROM topics WHERE id = ?').get(topicId)).status, 'NOT_STARTED')
  await assert.rejects(completeTimer(db, started.id), { code: 'TIMER_NOT_ACTIVE' })
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM study_sessions').get()).count, 1)
})

test('discarded timers remain recorded as discarded but do not create study sessions', async (context) => {
  const db = createDatabase(':memory:')
  const topicId = createTopic(db)
  context.after(() => db.close())
  const timer = await startTimer(db, { topic_id: topicId }, new Date('2026-11-01T10:00:00.000Z'))
  const discarded = await discardTimer(db, timer.id, new Date('2026-11-01T10:03:00.000Z'))
  assert.equal(discarded.status, 'DISCARDED')
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM study_sessions').get()).count, 0)
  assert.equal(await getActiveTimer(db), null)
})

test('timer API restores persisted active and paused state and rejects a second active timer', async (context) => {
  const db = createDatabase(':memory:')
  const topicId = createTopic(db)
  const server = createApp(db).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/study-sessions/timer`
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    db.close()
  })

  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { response, payload: response.status === 204 ? null : await response.json() }
  }
  const start = await request('/start', 'POST', { topic_id: topicId, session_date: '2026-11-01' })
  assert.equal(start.response.status, 201)
  const timerId = start.payload.data.id
  const duplicate = await request('/start', 'POST', { topic_id: topicId })
  assert.equal(duplicate.response.status, 409)
  assert.equal((await request('/current')).payload.data.id, timerId)
  assert.equal((await request(`/${timerId}/pause`, 'POST', {})).payload.data.status, 'PAUSED')
  assert.equal((await request('/current')).payload.data.status, 'PAUSED')
  assert.equal((await request(`/${timerId}/resume`, 'POST', {})).payload.data.status, 'RUNNING')
  assert.equal((await request(`/${timerId}/discard`, 'POST', {})).payload.data.status, 'DISCARDED')
  assert.equal((await request('/current')).payload.data, null)
})
