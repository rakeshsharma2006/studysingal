const { asyncHandler } = require('../middleware/asyncHandler')

function createResourceController(service) {
  return {
    list: asyncHandler(async (req, res) => res.json({ data: await service.list(req.query) })),
    get: asyncHandler(async (req, res) => {
      const record = await service.get(req.params.id)
      if (!record) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } })
      return res.json({ data: record })
    }),
    create: asyncHandler(async (req, res) => res.status(201).json({ data: await service.create(req.body) })),
    update: asyncHandler(async (req, res) => {
      const record = await service.update(req.params.id, req.body)
      if (!record) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } })
      return res.json({ data: record })
    }),
    remove: asyncHandler(async (req, res) => {
      const deleted = await service.delete(req.params.id)
      if (!deleted) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } })
      return res.status(204).end()
    }),
  }
}

module.exports = { createResourceController }
