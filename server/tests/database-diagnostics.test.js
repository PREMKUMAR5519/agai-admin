import { test } from 'node:test'
import assert from 'node:assert/strict'
import { databaseFailureMessage } from '../src/database-diagnostics.js'

test('finds TLS errors inside the server selection topology without exposing credentials', () => {
  const secret = 'mongodb+srv://admin:private-password@cluster.example'
  const tls = Object.assign(new Error(`TLS alert ${secret}`), { code: 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR' })
  const error = { reason: { servers: new Map([['host', { error: { cause: tls } }]]) } }
  const message = databaseFailureMessage(error)
  assert.match(message, /TLS connection failed/)
  assert.match(message, /Use for builds/)
  assert.ok(!message.includes(secret))
  assert.ok(!message.includes('private-password'))
})

test('distinguishes authentication and DNS failures', () => {
  assert.match(databaseFailureMessage({ code: 18 }), /authentication failed/)
  assert.match(databaseFailureMessage({ cause: { code: 'ENOTFOUND' } }), /DNS/)
})

test('unknown and cyclic errors produce safe messages', () => {
  const error = new Error('secret value')
  error.cause = error
  assert.match(databaseFailureMessage(error), /operation failed/)
  assert.ok(!databaseFailureMessage(error).includes('secret value'))
})
