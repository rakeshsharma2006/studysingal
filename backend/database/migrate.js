const fs = require('node:fs')
const path = require('node:path')

const migrationDirectory = path.join(__dirname, 'migrations')

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `)

  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version))
  const migrations = fs.readdirSync(migrationDirectory).filter((file) => file.endsWith('.sql')).sort()
  const applyMigration = db.transaction((version, sql) => {
    db.exec(sql)
    db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version)
  })

  for (const migration of migrations) {
    if (!applied.has(migration)) {
      applyMigration(migration, fs.readFileSync(path.join(migrationDirectory, migration), 'utf8'))
    }
  }
}

module.exports = { migrate }
