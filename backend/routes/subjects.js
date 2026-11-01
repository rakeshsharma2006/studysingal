const express = require('express')
const { validate } = require('../middleware/validate')
const { asyncHandler } = require('../middleware/asyncHandler')
const { parentParams } = require('../validators/schemas')

function createSubjectRouter(db) {
  const router = express.Router()
  router.get('/progress', asyncHandler((req, res) => {
    const subjects = db.prepare(`
      SELECT s.id, s.name, s.semester, s.exam_date,
        COUNT(t.id) AS total_topics,
        SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_topics
      FROM subjects s
      LEFT JOIN units u ON u.subject_id = s.id
      LEFT JOIN topics t ON t.unit_id = u.id
      GROUP BY s.id
      ORDER BY s.name COLLATE NOCASE
    `).all().map((subject) => ({
      ...subject,
      completed_topics: subject.completed_topics || 0,
      progress_percent: subject.total_topics ? Math.round((subject.completed_topics / subject.total_topics) * 100) : 0,
    }))
    res.json({ data: subjects })
  }))

  router.get('/:subjectId/units', validate(parentParams('subject'), 'params'), asyncHandler((req, res) => {
    if (!db.prepare('SELECT 1 FROM subjects WHERE id = ?').get(req.params.subjectId)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Subject not found.' } })
    }
    const units = db.prepare('SELECT * FROM units WHERE subject_id = ? ORDER BY position, id').all(req.params.subjectId)
    res.json({ data: units })
  }))
  return router
}

module.exports = { createSubjectRouter }
