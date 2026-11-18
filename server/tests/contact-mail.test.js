import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONTACT_MAILBOX, contactMessage, createContactMailer } from '../src/contact-mail.js'

const enquiry = { _id: 'b722c814-d511-4a1b-9f23-aee8f03f712b', name: '<script>bad</script>', email: 'visitor@example.com', phone: '+91 98765 43210', service: 'General enquiry', message: 'வணக்கம்\nQuestion <img src=x onerror=alert(1)> & follow-up', createdAt: new Date('2026-11-18T08:00:00Z') }

test('notification has fixed clinic addresses, safe HTML and Unicode/plain text', () => {
  const message = contactMessage(enquiry, 'https://admin.example.com')
  assert.equal(message.from.address, CONTACT_MAILBOX)
  assert.equal(message.to, CONTACT_MAILBOX)
  assert.deepEqual(message.replyTo, { address: 'visitor@example.com' })
  assert.ok(message.text.includes(enquiry.message))
  assert.ok(message.html.includes('&lt;script&gt;'))
  assert.ok(message.html.includes('&lt;img'))
  assert.ok(!message.html.includes('<script>'))
  assert.ok(message.html.includes('https://admin.example.com/contact-forms'))
  assert.equal(message.disableFileAccess, true)
  assert.equal(message.disableUrlAccess, true)
  assert.equal(contactMessage({ ...enquiry, email: '' }, 'https://admin.example.com').replyTo, undefined)
  assert.equal(message.messageId, contactMessage(enquiry, 'https://admin.example.com').messageId)
})

test('Gmail uses TLS, normalizes app-password spaces, and closes the transport', async () => {
  let settings, outgoing, closed = false
  const mailer = createContactMailer({ appPassword: 'abcd efgh ijkl mnop', adminUrl: 'https://admin.example.com', createTransport(options) {
    settings = options
    return { async sendMail(message) { outgoing = message; return { accepted: [CONTACT_MAILBOX], messageId: message.messageId } }, close() { closed = true } }
  } })
  await mailer.send(enquiry)
  assert.equal(settings.host, 'smtp.gmail.com')
  assert.equal(settings.port, 465)
  assert.equal(settings.secure, true)
  assert.deepEqual(settings.auth, { user: CONTACT_MAILBOX, pass: 'abcdefghijklmnop' })
  assert.equal(outgoing.to, CONTACT_MAILBOX)
  assert.equal(closed, true)
})

test('a stalled send times out and closes without blocking the contact request indefinitely', async () => {
  let closed = false
  const mailer = createContactMailer({ appPassword: 'test', adminUrl: 'https://admin.example.com', timeoutMs: 20, createTransport: () => ({ sendMail: () => new Promise(() => {}), close() { closed = true } }) })
  await assert.rejects(mailer.send(enquiry), { code: 'ETIMEDOUT' })
  assert.equal(closed, true)
})

test('missing credentials and rejected recipients are not reported as sent', async () => {
  const disabled = createContactMailer({ adminUrl: 'https://admin.example.com' })
  assert.equal(disabled.configured, false)
  await assert.rejects(disabled.send(enquiry), { code: 'NOT_CONFIGURED' })
  const rejected = createContactMailer({ appPassword: 'test', adminUrl: 'https://admin.example.com', createTransport: () => ({ sendMail: async () => ({ accepted: [] }), close() {} }) })
  await assert.rejects(rejected.send(enquiry), { code: 'EENVELOPE' })
})
