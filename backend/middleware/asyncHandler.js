function asyncHandler(handler) {
  return (req, res, next) => {
    try {
      return handler(req, res, next)
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = { asyncHandler }
