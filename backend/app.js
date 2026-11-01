const express = require('express')
const cors = require('cors')
const { randomUUID } = require('node:crypto')
const { getDatabase } = require('./database')
const { createApiRouter } = require('./routes/api')
const { errorHandler, notFoundHandler } = require('./middleware/errors')

function createApp(db = getDatabase()) {
  const app = express()
  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  app.disable('x-powered-by')
  app.use((req, res, next) => {
    req.requestId = randomUUID()
    res.setHeader('X-Request-Id', req.requestId)
    next()
  })
  app.use(cors({
    origin: allowedOrigins.length ? allowedOrigins : '*',
    exposedHeaders: ['X-Request-Id'],
  }))
  app.use(express.json({ limit: '1mb' }))
  app.use('/api', createApiRouter(db))
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
