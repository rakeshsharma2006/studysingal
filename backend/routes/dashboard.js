const express = require('express')
const { asyncHandler } = require('../middleware/asyncHandler')
const { validate } = require('../middleware/validate')
const { dateRange } = require('../validators/schemas')
const { getDashboardData } = require('../services/dashboard/dashboardService')
const { todayLocal } = require('../utils/date')

function createDashboardRouter(db) {
  const router = express.Router()
  router.get('/', validate(dateRange, 'query'), asyncHandler(async (req, res) => {
    res.json({ data: await getDashboardData(db, req.query.date || todayLocal()) })
  }))
  return router
}

module.exports = { createDashboardRouter }
