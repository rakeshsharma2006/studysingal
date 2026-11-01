const express = require('express')
const cors = require('cors')
const { getDatabase } = require('./database')
const { createApiRouter } = require('./routes/api')
const { errorHandler, notFoundHandler } = require('./middleware/errors')

function createApp(db = getDatabase()) {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))
  app.use('/api', createApiRouter(db))
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
