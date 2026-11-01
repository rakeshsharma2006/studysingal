const path = require('node:path')
const Database = require('better-sqlite3')
const { migrate } = require('./migrate')

let database

function createDatabase(filename = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'studysignal.sqlite')) {
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
  if (!database) database = createDatabase()
  return database
}

function closeDatabase() {
  if (database) {
    database.close()
    database = undefined
  }
}

module.exports = { createDatabase, getDatabase, closeDatabase }
