import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import session from 'express-session'
import { connectDatabase } from '../src/db.js'
import { createApp } from '../src/app.js'
import { createContactNotifications } from '../src/contact-notifications.js'
import { hashPassword } from '../src/security.js'

const databaseName = `agai_mail_test_${Date.now()}`
let client, db
const input = () => ({ submissionId: randomUUID(), name: 'Notification test', email: '', phone: '+91 98765 43210', message: 'A test enquiry with no real patient details.', service: 'General enquiry' })
const appFor = mailer => createApp({ client, db, contactMailer: mailer, sessionStore: new session.MemoryStore() })
before(async () => { ({ client, db } = await connectDatabase(databaseName)) })
after(async () => { if (db && databaseName.startsWith('agai_mail_test_')) await db.dropDatabase(); await client?.close() })

test('new enquiry sends from persisted data once, including concurrent duplicate submissions', async () => {
  const sent = []
  const app = appFor({ configured: true, async send(enquiry) {
    assert.ok(await db.collection('contactSubmissions').findOne({ _id: enquiry._id }))
    sent.push(enquiry)
    return { messageId: '<test@example.com>' }
  } })
  const body = input()
  await Promise.all(Array.from({ length: 4 }, () => request(app).post('/api/public/contact').send(body).expect(201)))
  await request(app).post('/api/public/contact').send({ ...body, name: 'Changed retry', message: 'This must not replace the first message.' }).expect(201)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].name, body.name)
  const stored = await db.collection('contactSubmissions').findOne({ _id: body.submissionId })
  assert.equal(stored.emailNotification.status, 'sent')
  assert.equal(stored.emailNotification.attempts, 1)
})

test('invalid contact inputs and rejected origins do not send mail', async () => {
  let sends = 0
  const app = appFor({ configured: true, async send() { sends++; return {} } })
  await request(app).post('/api/public/contact').send({ ...input(), phone: 'abc1234567' }).expect(400)
  await request(app).post('/api/public/contact').send({ ...input(), website: 'bot' }).expect(400)
  await request(app).post('/api/public/contact').set('Origin', 'https://untrusted.example').send(input()).expect(403)
  assert.equal(sends, 0)
})

test('mail failure preserves success, stores no raw error, and allows an authenticated CSRF-protected retry', async () => {
  let sends = 0
  const app = appFor({ configured: true, async send() {
    sends++
    if (sends === 1) throw Object.assign(new Error('Sensitive provider details must not be persisted'), { code: 'EAUTH' })
    return { messageId: '<retry@example.com>' }
  } })
  const body = input()
  const response = await request(app).post('/api/public/contact').send(body).expect(201)
  assert.equal(response.body.ok, true)
  assert.equal(response.body.emailNotification, undefined)
  const stored = await db.collection('contactSubmissions').findOne({ _id: body.submissionId })
  assert.equal(stored.emailNotification.status, 'failed')
  assert.equal(stored.emailNotification.errorCode, 'EAUTH')
  assert.ok(!JSON.stringify(stored).includes('Sensitive provider'))
  await request(app).post('/api/public/contact').send(body).expect(201)
  assert.equal(sends, 1, 'cooldown prevents rapid repeat email attempts')
  const route = `/api/contact-submissions/${body.submissionId}/notification`
  await request(app).post(route).expect(401)
  await db.collection('users').insertOne({ email: 'mail-admin@example.com', name: 'Test admin', passwordHash: await hashPassword('Mail-test-password-2026!'), authVersion: 1 })
  const agent = request.agent(app)
  const login = await agent.post('/api/auth/login').send({ email: 'mail-admin@example.com', password: 'Mail-test-password-2026!' }).expect(200)
  await agent.post(route).expect(403)
  await db.collection('contactSubmissions').updateOne({ _id: body.submissionId }, { $set: { 'emailNotification.nextAttemptAt': new Date(0) } })
  const retry = await agent.post(route).set('X-CSRF-Token', login.body.csrf).expect(200)
  assert.equal(retry.body.notification.status, 'sent')
  await agent.post(route).set('X-CSRF-Token', login.body.csrf).expect(200)
  assert.equal(sends, 2)
  const list = await agent.get('/api/contact-submissions').expect(200)
  assert.equal(list.body.emailConfigured, true)
  assert.equal(list.body.items.find(item => item._id === body.submissionId).emailNotification.lock, undefined)
})

test('missing mail settings are visible without losing enquiries or sending older records', async () => {
  const app = appFor({ configured: false, async send() { throw new Error('Must not send') } })
  const body = input()
  await request(app).post('/api/public/contact').send(body).expect(201)
  assert.equal((await db.collection('contactSubmissions').findOne({ _id: body.submissionId })).emailNotification.status, 'not_configured')
  const legacy = input()
  await db.collection('contactSubmissions').insertOne({ _id: legacy.submissionId, createdAt: new Date(), ...legacy })
  const notifications = createContactNotifications({ db, mailer: { configured: true, async send() { throw new Error('Must not send older enquiry') } } })
  assert.equal((await notifications.send(legacy.submissionId)).status, 'not_requested')
})

test('a stale in-progress claim can recover; an active claim cannot send twice', async () => {
  const body = input(), time = new Date()
  await db.collection('contactSubmissions').insertOne({ _id: body.submissionId, ...body, createdAt: time, emailNotification: { status: 'sending', attempts: 1, lock: 'stale', lockUntil: new Date(time.getTime() + 90000) } })
  let sends = 0
  const notifications = createContactNotifications({ db, now: () => time, mailer: { configured: true, async send() { sends++; return { messageId: '<recovered@example.com>' } } } })
  assert.equal((await notifications.send(body.submissionId)).status, 'sending')
  assert.equal(sends, 0)
  await db.collection('contactSubmissions').updateOne({ _id: body.submissionId }, { $set: { 'emailNotification.lockUntil': new Date(0) } })
  assert.equal((await notifications.send(body.submissionId)).status, 'sent')
  assert.equal(sends, 1)
})
