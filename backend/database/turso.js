const { createClient } = require('@libsql/client')
const fs = require('node:fs')
const path = require('node:path')

function bindArgs(args) {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    return args[0]
  }
  return args
}

function mapRows(result) {
  return result.rows.map((row) => Object.fromEntries(
    result.columns.map((column) => [column, row[column]]),
  ))
}

function createTursoAdapter(client) {
  return {
    async exec(sql) {
      await client.execute(sql)
    },
    prepare(sql) {
      return {
        async all(...args) {
          const result = await client.execute({ sql, args: bindArgs(args) })
          return mapRows(result)
        },
        async get(...args) {
          const result = await client.execute({ sql, args: bindArgs(args) })
          return mapRows(result)[0]
        },
        async run(...args) {
          const result = await client.execute({ sql, args: bindArgs(args) })
          return {
            changes: result.rowsAffected,
            lastInsertRowid: result.lastInsertRowid == null ? undefined : Number(result.lastInsertRowid),
          }
        },
      }
    },
    close() {
      client.close()
    },
    client,
  }
}

function splitMigrationStatements(sql) {
  const statements = []
  let buffer = ''
  let inTrigger = false

  for (const line of sql.split(/\r?\n/)) {
    buffer += `${line}\n`
    if (!inTrigger && /\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i.test(buffer)) inTrigger = true
    if (inTrigger) {
      if (/^\s*END\s*;\s*$/i.test(line)) {
        statements.push(buffer.trim())
        buffer = ''
        inTrigger = false
      }
    } else if (line.includes(';')) {
      statements.push(buffer.trim())
      buffer = ''
    }
  }

  if (buffer.trim()) statements.push(buffer.trim())
  return statements.filter(Boolean)
}

async function migrateTurso(client, migrationDirectory = path.join(__dirname, 'migrations')) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `)

  const appliedResult = await client.execute('SELECT version FROM schema_migrations')
  const applied = new Set(appliedResult.rows.map((row) => row.version))
  const migrations = fs.readdirSync(migrationDirectory).filter((file) => file.endsWith('.sql')).sort()

  for (const migration of migrations) {
    if (applied.has(migration)) continue
    const sql = fs.readFileSync(path.join(migrationDirectory, migration), 'utf8')
    const statements = splitMigrationStatements(sql).map((statement) => ({ sql: statement }))
    statements.push({
      sql: 'INSERT INTO schema_migrations (version) VALUES (?)',
      args: [migration],
    })
    await client.batch(statements, 'write')
  }
}

async function createTursoDatabase({ url, authToken }) {
  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required for the production database.')
  }
  const client = createClient({ url, authToken })
  try {
    await migrateTurso(client)
    return createTursoAdapter(client)
  } catch (error) {
    client.close()
    throw error
  }
}

module.exports = {
  bindArgs,
  createTursoAdapter,
  splitMigrationStatements,
  migrateTurso,
  createTursoDatabase,
}
