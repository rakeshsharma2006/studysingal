const express = require('express')
const { validate } = require('../middleware/validate')
const { asyncHandler } = require('../middleware/asyncHandler')
const { getKnowledgeThresholds } = require('../services/analytics/config')
const { getRecommendations } = require('../services/recovery/recommendationEngine')
const { z } = require('zod')
const { isValidDate } = require('../utils/date')
const defaultThresholds = getKnowledgeThresholds()

const querySchema = z.object({
  date: z.string().refine(isValidDate, 'Date must be a valid YYYY-MM-DD calendar date.').optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  needsAttentionBelow: z.coerce.number().min(0).max(100).optional(),
  reinforcementBelow: z.coerce.number().min(0).max(100).optional(),
}).refine((value) => (
  (value.needsAttentionBelow ?? defaultThresholds.needsAttentionBelow)
  <= (value.reinforcementBelow ?? defaultThresholds.reinforcementBelow)
), {
  path: ['reinforcementBelow'],
  message: 'Reinforcement threshold must be at least the needs-attention threshold.',
})

function createRecoveryRouter(db) {
  const router = express.Router()
  router.get('/recommendations', validate(querySchema, 'query'), asyncHandler((req, res) => {
    const thresholds = getKnowledgeThresholds({
      needsAttentionBelow: req.query.needsAttentionBelow,
      reinforcementBelow: req.query.reinforcementBelow,
    })
    res.json({
      data: getRecommendations(db, {
        today: req.query.date,
        limit: req.query.limit,
        thresholds,
      }),
    })
  }))
  return router
}

module.exports = { createRecoveryRouter }
