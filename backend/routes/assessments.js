const express = require('express')
const { asyncHandler } = require('../middleware/asyncHandler')
const { validate } = require('../middleware/validate')
const { createSchemas, idParams } = require('../validators/schemas')
const { createResourceService } = require('../services/resourceService')
const { calculateEvidenceScore } = require('../services/analytics/knowledgeConfidence')

function createAssessmentRouter(db) {
  const router = express.Router()
  const service = createResourceService(db, 'topic_assessments')
  router.get('/', asyncHandler(async (req, res) => {
    const data = (await service.list()).map((attempt) => ({ ...attempt, ...calculateEvidenceScore(attempt) }))
    res.json({ data })
  }))
  router.post('/', validate(createSchemas.topic_assessments), asyncHandler(async (req, res) => {
    const data = await service.create(req.body)
    res.status(201).json({ data: { ...data, ...calculateEvidenceScore(data) } })
  }))
  router.get('/:id', validate(idParams, 'params'), asyncHandler(async (req, res) => {
    const data = await service.get(req.params.id)
    if (!data) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found.' } })
    return res.json({ data: { ...data, ...calculateEvidenceScore(data) } })
  }))
  router.patch('/:id', validate(idParams, 'params'), asyncHandler((req, res) => res.status(405).json({
    error: { code: 'ASSESSMENT_HISTORY_IMMUTABLE', message: 'Assessment attempts are immutable. Record a new attempt to update confidence or scores.' },
  })))
  router.delete('/:id', validate(idParams, 'params'), asyncHandler((req, res) => res.status(405).json({
    error: { code: 'ASSESSMENT_HISTORY_IMMUTABLE', message: 'Assessment attempts are retained as historical records.' },
  })))
  return router
}

module.exports = { createAssessmentRouter }
