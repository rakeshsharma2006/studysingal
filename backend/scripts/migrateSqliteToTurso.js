require('dotenv').config()

const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')
const { createClient } = require('@libsql/client')
const { migrateTurso, splitMigrationStatements } = require('../database/turso')

const TABLES = [
  'subjects',
  'units',
  'topics',
  'habits',
  'habit_logs',
  'study_plans',
  'study_sessions',
  'topic_assessments',
  'revision_tasks',
  'topic_completion_history',
]

function getLocalDatabasePath() {
  const configured = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'studysignal.sqlite')
  return path.isAbsolute(configured) ? configured : path.resolve(__dirname, '..', configured)
}

function getBackupPath(sourcePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(path.dirname(sourcePath), `studysignal-pre-turso-${timestamp}.sqlite`)
}

async function assertTargetEmpty(client) {
  const populated = []
  for (const table of TABLES) {
    const result = await client.execute(`SELECT COUNT(*) AS count FROM "${table}"`)
    const count = Number(result.rows[0].count)
    if (count) populated.push({ table, count })
  }
  if (populated.length) {
    throw new Error(`Turso target is not empty; refusing to import: ${populated.map(({ table, count }) => `${table}=${count}`).join(', ')}`)
  }
}

async function transferTable(transaction, source, table) {
  const columns = source.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name)
  if (!columns.length) throw new Error(`Local database is missing required table "${table}".`)
  const rows = source.prepare(`SELECT * FROM "${table}" ORDER BY id`).all()
  const sql = `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  for (const row of rows) {
    await transaction.execute({ sql, args: columns.map((column) => row[column]) })
  }
  return rows.length
}

async function verifyCounts(transaction, sourceCounts) {
  const verified = {}
  for (const table of TABLES) {
    const result = await transaction.execute(`SELECT COUNT(*) AS count FROM "${table}"`)
    const actual = Number(result.rows[0].count)
    if (actual !== sourceCounts[table]) {
      throw new Error(`Row count mismatch for ${table}: local=${sourceCounts[table]}, Turso=${actual}.`)
    }
    verified[table] = actual
  }

  const foreignKeyViolations = await transaction.execute('PRAGMA foreign_key_check')
  if (foreignKeyViolations.rows.length) {
    throw new Error(`Foreign-key verification failed with ${foreignKeyViolations.rows.length} violation(s).`)
  }
  return verified
}

async function migrateSqliteToTurso({
  sourcePath = getLocalDatabasePath(),
  backupPath = getBackupPath(sourcePath),
  url = process.env.TURSO_DATABASE_URL,
  authToken = process.env.TURSO_AUTH_TOKEN,
  targetClient,
} = {}) {
  const isLocalTarget = url === ':memory:' || url?.startsWith('file:')
  if (!url || (!authToken && !isLocalTarget)) throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured.')
  if (!fs.existsSync(sourcePath)) throw new Error(`Local SQLite database not found: ${sourcePath}`)
  if (fs.existsSync(backupPath)) throw new Error(`Backup destination already exists; choose a new path: ${backupPath}`)

  const local = new Database(sourcePath, { readonly: true, fileMustExist: true })
  let backup
  let client = targetClient
  const ownsClient = !targetClient
  let transaction
  try {
    await local.backup(backupPath)
    backup = new Database(backupPath, { readonly: true, fileMustExist: true })
    const integrity = backup.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') throw new Error(`SQLite backup integrity check failed: ${integrity}`)
    const foreignKeyViolations = backup.pragma('foreign_key_check')
    if (foreignKeyViolations.length) throw new Error(`SQLite source contains ${foreignKeyViolations.length} foreign-key violation(s).`)

    client ||= createClient({ url, authToken })
    await migrateTurso(client)
    await assertTargetEmpty(client)
    const sourceCounts = Object.fromEntries(TABLES.map((table) => [
      table,
      backup.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count,
    ]))
    const triggerMigration = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '003_topic_completion_history.sql'), 'utf8')
    const triggerStatements = splitMigrationStatements(triggerMigration)
      .filter((statement) => /^\s*CREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i.test(statement))

    transaction = await client.transaction('write')
    await transaction.execute('DROP TRIGGER IF EXISTS trg_topics_insert_completion_history')
    await transaction.execute('DROP TRIGGER IF EXISTS trg_topics_update_completion_history')

    for (const table of TABLES) {
      await transferTable(transaction, backup, table)
    }

    for (const statement of triggerStatements) await transaction.execute(statement)
    const verifiedCounts = await verifyCounts(transaction, sourceCounts)
    await transaction.commit()
    transaction = undefined
    return { backupPath, rowCounts: verifiedCounts }
  } catch (error) {
    if (transaction) await transaction.rollback()
    throw error
  } finally {
    backup?.close()
    local.close()
    if (ownsClient) await client?.close()
  }
}

if (require.main === module) {
  migrateSqliteToTurso()
    .then((result) => {
      console.log(JSON.stringify({ status: 'verified', backupPath: result.backupPath, rowCounts: result.rowCounts }, null, 2))
    })
    .catch((error) => {
      console.error(JSON.stringify({ status: 'failed', errorName: error.name, message: error.message }))
      process.exitCode = 1
    })
}

module.exports = { TABLES, getLocalDatabasePath, getBackupPath, assertTargetEmpty, transferTable, verifyCounts, migrateSqliteToTurso }
