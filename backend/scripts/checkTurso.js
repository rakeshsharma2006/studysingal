require('dotenv').config()

const { createClient } = require('@libsql/client')

async function checkTurso() {
  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken } = process.env
  if (!url || !authToken) throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured.')
  const client = createClient({ url, authToken })
  try {
    const result = await client.execute('SELECT 1 AS connected')
    if (Number(result.rows[0].connected) !== 1) throw new Error('Turso connectivity query returned an unexpected result.')
    return { status: 'connected' }
  } finally {
    client.close()
  }
}

if (require.main === module) {
  checkTurso()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(JSON.stringify({ status: 'failed', errorName: error.name, code: error.code }))
      process.exitCode = 1
    })
}

module.exports = { checkTurso }
