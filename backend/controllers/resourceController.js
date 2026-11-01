const { asyncHandler } = require('../middleware/asyncHandler')

function createResourceController(service) {
  return {
    list: asyncHandler((req, res) => res.json({ data: service.list(req.query) })),
    get: asyncHandler((req, res) => {
      const record = service.get(req.params.id)
      if (!record) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } })
      return res.json({ data: record })
    }),
    create: asyncHandler((req, res) => res.status(201).json({ data: service.create(req.body) })),
    update: asyncHandler((req, res) => {
      const record = service.update(req.params.id, req.body)
      if (!record) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } })
      return res.json({ data: record })
    }),
    remove: asyncHandler((req, res) => {
      if (!service.delete(req.params.id)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } })
      return res.status(204).end()
    }),
  }
}

module.exports = { createResourceController }
