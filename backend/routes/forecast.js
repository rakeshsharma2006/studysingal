const express = require('express')
const { z } = require('zod')
const { asyncHandler } = require('../middleware/asyncHandler')
const { validate } = require('../middleware/validate')
const { isValidDate } = require('../utils/date')
const { getExamForecast } = require('../services/forecast/examForecast')

const querySchema = z.object({
  date: z.string().refine(isValidDate, 'Date must be a valid YYYY-MM-DD calendar date.').optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  targetTopicsPerDay: z.coerce.number().positive().max(100).optional(),
})

function createForecastRouter(db) {
  const router = express.Router()
  router.get('/', validate(querySchema, 'query'), asyncHandler((req, res) => {
    const data = getExamForecast(db, {
      today: req.query.date,
      subjectId: req.query.subjectId,
      targetTopicsPerDay: req.query.targetTopicsPerDay || 1,
      scenarios: [1, 2],
    })
    if (req.query.subjectId && !data.forecasts.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Subject not found.' } })
    }
    return res.json({ data })
  }))
  return router
}

module.exports = { createForecastRouter }
