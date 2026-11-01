require('dotenv').config()

const { createApp } = require('./app')
const { closeDatabase } = require('./database')

const port = Number(process.env.PORT || 3001)
const app = createApp()
let server

function shutdown() {
  server?.close(() => {
    closeDatabase().finally(() => process.exit(0))
  })
}

if (require.main === module) {
  server = app.listen(port, () => {
    console.log(`StudySignal API listening on http://localhost:${port}`)
  })
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

module.exports = app
