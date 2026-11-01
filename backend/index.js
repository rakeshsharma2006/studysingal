require('dotenv').config()

const { createApp } = require('./app')
const { getDatabase, closeDatabase } = require('./database')

const port = Number(process.env.PORT || 3001)
const app = createApp(getDatabase())
const server = app.listen(port, () => {
  console.log(`StudySignal API listening on http://localhost:${port}`)
})

function shutdown() {
  server.close(() => {
    closeDatabase()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
