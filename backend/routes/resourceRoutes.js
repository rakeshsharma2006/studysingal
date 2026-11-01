const express = require('express')
const { createSchemas, updateSchemas, idParams, collectionDateFilters } = require('../validators/schemas')
const { validate } = require('../middleware/validate')
const { createResourceController } = require('../controllers/resourceController')
const { createResourceService } = require('../services/resourceService')

function createResourceRouter(db, name) {
  const router = express.Router()
  const controller = createResourceController(createResourceService(db, name))
  router.get('/', ...(name === 'habit_logs' || name === 'study_sessions' ? [validate(collectionDateFilters, 'query')] : []), controller.list)
  router.post('/', validate(createSchemas[name]), controller.create)
  router.get('/:id', validate(idParams, 'params'), controller.get)
  router.patch('/:id', validate(idParams, 'params'), validate(updateSchemas[name]), controller.update)
  router.delete('/:id', validate(idParams, 'params'), controller.remove)
  return router
}

module.exports = { createResourceRouter }
