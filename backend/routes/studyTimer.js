const express = require('express')
const { z } = require('zod')
const { validate } = require('../middleware/validate')
const { asyncHandler } = require('../middleware/asyncHandler')
const { isValidDate } = require('../utils/date')
const {
  getActiveTimer,
  startTimer,
  pauseTimer,
  resumeTimer,
  completeTimer,
  discardTimer,
} = require('../services/studyTimerService')

const startSchema = z.object({
  topic_id: z.number().int().positive(),
  session_date: z.string().refine(isValidDate).optional(),
})
const idParams = z.object({ id: z.coerce.number().int().positive() })

function createStudyTimerRouter(db) {
  const router = express.Router()
  router.get('/current', asyncHandler(async (req, res) => {
    res.json({ data: await getActiveTimer(db) })
  }))
  router.post('/start', validate(startSchema), asyncHandler(async (req, res) => {
    res.status(201).json({ data: await startTimer(db, req.body) })
  }))
  router.post('/:id/pause', validate(idParams, 'params'), asyncHandler(async (req, res) => {
    res.json({ data: await pauseTimer(db, req.params.id) })
  }))
  router.post('/:id/resume', validate(idParams, 'params'), asyncHandler(async (req, res) => {
    res.json({ data: await resumeTimer(db, req.params.id) })
  }))
  router.post('/:id/complete', validate(idParams, 'params'), asyncHandler(async (req, res) => {
    res.json({ data: await completeTimer(db, req.params.id) })
  }))
  router.post('/:id/discard', validate(idParams, 'params'), asyncHandler(async (req, res) => {
    res.json({ data: await discardTimer(db, req.params.id) })
  }))
  return router
}

module.exports = { createStudyTimerRouter }
