const express = require('express')
const { asyncHandler } = require('../middleware/asyncHandler')

function createStudySessionRouter(db) {
  const router = express.Router()
  router.get('/summary/by-subject', asyncHandler((req, res) => {
    const data = db.prepare(`
      SELECT s.id AS subject_id, s.name AS subject_name,
        COALESCE(SUM(ss.duration_minutes), 0) AS total_minutes,
        COUNT(ss.id) AS session_count
      FROM subjects s
      LEFT JOIN units u ON u.subject_id = s.id
      LEFT JOIN topics t ON t.unit_id = u.id
      LEFT JOIN study_sessions ss ON ss.topic_id = t.id
      GROUP BY s.id ORDER BY total_minutes DESC, s.name COLLATE NOCASE
    `).all()
    res.json({ data })
  }))
  return router
}

module.exports = { createStudySessionRouter }
