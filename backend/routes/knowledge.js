const express = require('express')
const { asyncHandler } = require('../middleware/asyncHandler')
const { validate } = require('../middleware/validate')
const { parentParams, createSchemas, analyticsQuery } = require('../validators/schemas')
const { getKnowledgeAnalysis } = require('../services/analytics/knowledgeGap')

function createKnowledgeRouter(db) {
  const router = express.Router()
  router.use(validate(analyticsQuery, 'query'))
  router.get('/analysis', asyncHandler(async (req, res) => {
    const thresholds = {}
    if (req.query.needsAttentionBelow !== undefined) thresholds.needsAttentionBelow = req.query.needsAttentionBelow
    if (req.query.reinforcementBelow !== undefined) thresholds.reinforcementBelow = req.query.reinforcementBelow
    res.json({ data: await getKnowledgeAnalysis(db, { thresholds }) })
  }))
  return router
}

function createTopicKnowledgeRouter(db) {
  const router = express.Router()
  router.get('/:topicId/assessments', validate(parentParams('topic'), 'params'), asyncHandler(async (req, res) => {
    if (!await db.prepare('SELECT id FROM topics WHERE id = ?').get(req.params.topicId)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Topic not found.' } })
    }
    const data = await db.prepare('SELECT * FROM topic_assessments WHERE topic_id = ? ORDER BY created_at DESC, id DESC')
      .all(req.params.topicId)
    res.json({ data })
  }))

  router.post('/:topicId/assessments', validate(parentParams('topic'), 'params'), validate(createSchemas.topic_assessments), asyncHandler(async (req, res) => {
    if (Number(req.params.topicId) !== req.body.topic_id) {
      return res.status(400).json({ error: { code: 'TOPIC_MISMATCH', message: 'The topic in the URL must match topic_id in the request body.' } })
    }
    const columns = ['topic_id', 'quiz_score', 'recall_score', 'confidence', 'confidence_rating']
    const values = columns.map((column) => req.body[column] ?? null)
    const placeholders = columns.map(() => '?').join(', ')
    const result = await db.prepare(`INSERT INTO topic_assessments (${columns.join(', ')}) VALUES (${placeholders})`).run(...values)
    const data = await db.prepare('SELECT * FROM topic_assessments WHERE id = ?').get(Number(result.lastInsertRowid))
    res.status(201).json({ data })
  }))

  router.get('/:topicId/revisions', validate(parentParams('topic'), 'params'), asyncHandler(async (req, res) => {
    if (!await db.prepare('SELECT id FROM topics WHERE id = ?').get(req.params.topicId)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Topic not found.' } })
    }
    const data = await db.prepare('SELECT * FROM revision_tasks WHERE topic_id = ? ORDER BY due_date DESC, id DESC')
      .all(req.params.topicId)
    res.json({ data })
  }))

  return router
}

module.exports = { createKnowledgeRouter, createTopicKnowledgeRouter }
