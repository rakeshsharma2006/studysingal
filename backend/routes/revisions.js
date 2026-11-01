const express = require('express')
const { asyncHandler } = require('../middleware/asyncHandler')
const { validate } = require('../middleware/validate')
const { dateRange } = require('../validators/schemas')
const { todayLocal } = require('../utils/date')

function createRevisionRouter(db) {
  const router = express.Router()
  router.get('/overdue', validate(dateRange, 'query'), asyncHandler((req, res) => {
    const today = req.query.date || todayLocal()
    const data = db.prepare(`
      SELECT rt.*, t.title AS topic_title, s.id AS subject_id, s.name AS subject_name
      FROM revision_tasks rt
      JOIN topics t ON t.id = rt.topic_id
      JOIN units u ON u.id = t.unit_id
      JOIN subjects s ON s.id = u.subject_id
      WHERE rt.status = 'PENDING' AND rt.due_date < ?
      ORDER BY rt.due_date, rt.id
    `).all(today)
    res.json({ data })
  }))
  return router
}

module.exports = { createRevisionRouter }
