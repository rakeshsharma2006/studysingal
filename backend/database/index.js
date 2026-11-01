const path = require('node:path')
const { migrate } = require('./migrate')

let database
let databasePromise

function createDatabase(filename = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'studysignal.sqlite')) {
  const Database = require('better-sqlite3')
  let db
  try {
    if (filename !== ':memory:') {
      const fs = require('node:fs')
      fs.mkdirSync(path.dirname(filename), { recursive: true })
    }
    db = new Database(filename)
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 5000')
    migrate(db)
    db.batch = (statements) => db.transaction(() => statements.map(({ sql, args = [] }) => (
      db.prepare(sql).run(...(Array.isArray(args) ? args : [args]))
    )))()
    return db
  } catch (error) {
    if (db?.open) db.close()
    console.error(JSON.stringify({
      event: 'database_initialization_failed',
      databasePath: filename === ':memory:' ? ':memory:' : path.basename(filename),
      errorName: error.name,
      errorCode: error.code,
    }))
    throw error
  }
}

function getDatabase() {
  if (!databasePromise) {
    if (process.env.NODE_ENV === 'production' || process.env.TURSO_DATABASE_URL || process.env.TURSO_AUTH_TOKEN) {
      const { createTursoDatabase } = require('./turso')
      databasePromise = createTursoDatabase({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      })
    } else {
      databasePromise = Promise.resolve().then(() => {
        database = createDatabase()
        return database
      })
    }
  }
  return databasePromise
}

function closeDatabase() {
  return Promise.resolve(databasePromise).then((db) => db?.close?.(), () => undefined).finally(() => {
    database = undefined
    databasePromise = undefined
  })
}

module.exports = { createDatabase, getDatabase, closeDatabase }
