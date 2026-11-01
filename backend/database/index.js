const path = require('node:path')
const Database = require('better-sqlite3')
const { migrate } = require('./migrate')

let database

function createDatabase(filename = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'studysignal.sqlite')) {
  if (filename !== ':memory:') {
    const fs = require('node:fs')
    fs.mkdirSync(path.dirname(filename), { recursive: true })
  }
  const db = new Database(filename)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  migrate(db)
  return db
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
