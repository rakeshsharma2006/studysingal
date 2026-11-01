function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No API route for ${req.method} ${req.originalUrl}`,
      requestId: req.requestId,
    },
  })
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)

  const requestId = req.requestId
  if (typeof error.code === 'string' && error.code.startsWith('TIMER_')) {
    return res.status(error.status || 409).json({
      error: { code: error.code, message: error.message, requestId },
    })
  }
  if (error.code === 'DATABASE_UNAVAILABLE') {
    console.error(JSON.stringify({ event: 'database_unavailable', requestId }))
    return res.status(503).json({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'The application database is temporarily unavailable.',
        requestId,
      },
    })
  }
  const constraintCode = error.code === 'SQLITE_CONSTRAINT' && typeof error.message === 'string'
    ? error.message
    : error.code
  if (constraintCode === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(constraintCode || '')) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with these values already exists.', requestId } })
  }
  if (constraintCode === 'SQLITE_CONSTRAINT_FOREIGNKEY' || constraintCode === 'SQLITE_CONSTRAINT_TRIGGER'
    || /FOREIGN KEY constraint failed/i.test(constraintCode || '')) {
    return res.status(409).json({ error: { code: 'REFERENCED_RECORD', message: 'This record is referenced by other data and cannot be changed or deleted.', requestId } })
  }
  if (constraintCode === 'SQLITE_CONSTRAINT_CHECK' || constraintCode === 'SQLITE_CONSTRAINT_NOTNULL'
    || /CHECK constraint failed|NOT NULL constraint failed/i.test(constraintCode || '')) {
    return res.status(400).json({ error: { code: 'CONSTRAINT_VIOLATION', message: 'The submitted data violates a database constraint.', requestId } })
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.', requestId } })
  }

  console.error(JSON.stringify({
    event: 'unhandled_api_error',
    requestId,
    method: req.method,
    path: req.path,
    errorName: error.name,
    errorCode: error.code,
  }))
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.', requestId } })
}

module.exports = { errorHandler, notFoundHandler }
