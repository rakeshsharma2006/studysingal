const assert = require('node:assert/strict')
const test = require('node:test')

test('Vercel app entrypoint exports one Express application and retains the factory', () => {
  const app = require('../app')
  const packageEntry = require('..')
  const localEntry = require('../index')

  assert.equal(typeof app, 'function')
  assert.equal(typeof app.listen, 'function')
  assert.equal(typeof app.createApp, 'function')
  assert.equal(packageEntry, app)
  assert.equal(localEntry, app)
})
