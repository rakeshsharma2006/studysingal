const express = require('express')
const { asyncHandler } = require('../middleware/asyncHandler')
const { validate } = require('../middleware/validate')
const { analyticsQuery } = require('../validators/schemas')
const { getAcademicDrift } = require('../services/analytics/academicDrift')
const { getAcademicDebt } = require('../services/analytics/academicDebt')
const { getKnowledgeAnalysis } = require('../services/analytics/knowledgeGap')
const { getHabitImpact } = require('../services/analytics/habitImpact')
const { getAnalyticsReport } = require('../services/analytics/analyticsService')

function createAnalyticsRouter(db) {
  const router = express.Router()
  router.use(validate(analyticsQuery, 'query'))
  router.get('/drift', asyncHandler(async (req, res) => res.json({
    data: await getAcademicDrift(db, { period: req.query.period || 'daily', date: req.query.date }),
  })))
  router.get('/debt', asyncHandler(async (req, res) => res.json({ data: await getAcademicDebt(db, req.query.date) })))
  router.get('/knowledge-gaps', asyncHandler(async (req, res) => res.json({
    data: await getKnowledgeAnalysis(db, {
      thresholds: {
        needsAttentionBelow: req.query.needsAttentionBelow,
        reinforcementBelow: req.query.reinforcementBelow,
      },
    }),
  })))
  router.get('/habit-impact', asyncHandler(async (req, res) => res.json({
    data: await getHabitImpact(db, { days: req.query.days || 30 }),
  })))
  router.get('/report', asyncHandler(async (req, res) => res.json({
    data: await getAnalyticsReport(db, {
      period: req.query.period || 'daily',
      date: req.query.date,
      days: req.query.days || 30,
      thresholds: {
        needsAttentionBelow: req.query.needsAttentionBelow,
        reinforcementBelow: req.query.reinforcementBelow,
      },
    }),
  })))
  return router
}

module.exports = { createAnalyticsRouter }
