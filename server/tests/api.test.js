import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import request from 'supertest'
import session from 'express-session'
import sharp from 'sharp'
import { connectDatabase } from '../src/db.js'
import { createApp } from '../src/app.js'
import { hashPassword } from '../src/security.js'
import { config, root } from '../src/config.js'

const databaseName = `agai_cms_test_${Date.now()}`
const password = 'Test-only-password-2026!'
let client, db, app, agent, csrf, post
const uploadedFiles = []
const seed = JSON.parse(readFileSync(resolve(root, 'seed/content.json'), 'utf8'))
before(async () => {
  ;({ client, db } = await connectDatabase(databaseName))
  await db.collection('users').insertOne({ email: 'test@example.com', name: 'Test editor', passwordHash: await hashPassword(password), authVersion: 1 })
  await db.collection('content').insertOne({ _id: 'main', draft: seed.content, published: seed.content, revision: 0, publishedRevision: 0, publishedAt: new Date() })
  app = createApp({ db, client, sessionStore: new session.MemoryStore() })
  agent = request.agent(app)
})
after(async () => {
  for (const filename of uploadedFiles) unlinkSync(resolve(config.uploads, filename))
  if (db && databaseName.startsWith('agai_cms_test_')) await db.dropDatabase()
  await client?.close()
})
test('private APIs reject unauthenticated access; public API contains no drafts', async () => {
  await request(app).get('/api/posts').expect(401)
  const result = await request(app).get('/api/public/content').expect(200)
  assert.equal(result.headers['access-control-allow-origin'], '*')
  assert.equal(result.body.schemaVersion, 1)
  assert.deepEqual(result.body.articles, [])
  assert.equal(result.body.draft, undefined)
})
test('login protects origins, verifies passwords, and sets an HttpOnly session', async () => {
  await request(app).post('/api/auth/login').set('Origin', 'https://untrusted.example').send({ email: 'test@example.com', password }).expect(403)
  await agent.post('/api/auth/login').send({ email: 'test@example.com', password: 'wrong' }).expect(401)
  const result = await agent.post('/api/auth/login').send({ email: 'test@example.com', password }).expect(200)
  assert.match(result.headers['set-cookie'][0], /HttpOnly/)
  assert.match(result.headers['set-cookie'][0], /SameSite=Strict/)
  csrf = result.body.csrf
  assert.equal(typeof csrf, 'string')
  await agent.get('/api/auth/me').expect(200)
})
test('CSRF and content validation reject unsafe writes', async () => {
  await agent.post('/api/posts').send(seed.articles[0]).expect(403)
  await agent.post('/api/posts').set('X-CSRF-Token', csrf).send({ ...seed.articles[0], slug: '../../bad' }).expect(400)
  await agent.post('/api/posts').set('X-CSRF-Token', csrf).send({ ...seed.articles[0], image: 'javascript:alert(1)' }).expect(400)
})
test('draft, publish, edit, and conflict handling keep public content correct', async () => {
  const draft = { ...seed.articles[0], slug: 'test-publishing', title: 'First published title' }
  post = (await agent.post('/api/posts').set('X-CSRF-Token', csrf).send(draft).expect(201)).body
  assert.equal((await request(app).get('/api/public/content')).body.articles.length, 0)
  await agent.post('/api/posts').set('X-CSRF-Token', csrf).send(draft).expect(409)
  post = (await agent.post(`/api/posts/${post._id}/publish`).set('X-CSRF-Token', csrf).send({ revision: post.revision }).expect(200)).body
  assert.equal((await request(app).get('/api/public/content')).body.articles[0].title, draft.title)
  const oldRevision = post.revision
  post = (await agent.put(`/api/posts/${post._id}`).set('X-CSRF-Token', csrf).send({ revision: oldRevision, data: { ...draft, title: 'Private changes' } }).expect(200)).body
  await agent.put(`/api/posts/${post._id}`).set('X-CSRF-Token', csrf).send({ revision: oldRevision, data: draft }).expect(409)
  assert.equal((await request(app).get('/api/public/content')).body.articles[0].title, 'First published title')
  post = (await agent.post(`/api/posts/${post._id}/publish`).set('X-CSRF-Token', csrf).send({ revision: post.revision }).expect(200)).body
  assert.equal((await request(app).get('/api/public/content')).body.articles[0].title, 'Private changes')
})
test('archive removes articles publicly and restore keeps them as drafts', async () => {
  post = (await agent.post(`/api/posts/${post._id}/archive`).set('X-CSRF-Token', csrf).send({ revision: post.revision }).expect(200)).body
  assert.equal((await request(app).get('/api/public/content')).body.articles.length, 0)
  await agent.post(`/api/posts/${post._id}/publish`).set('X-CSRF-Token', csrf).send({ revision: post.revision }).expect(400)
  post = (await agent.post(`/api/posts/${post._id}/restore`).set('X-CSRF-Token', csrf).send({ revision: post.revision }).expect(200)).body
  assert.equal(post.published, null)
  assert.equal(post.archived, false)
})
test('website content is validated and only changes publicly on publish', async () => {
  const draft = structuredClone(seed.content)
  draft.home.featureTitle = 'Updated website introduction'
  const result = await agent.put('/api/content').set('X-CSRF-Token', csrf).send({ revision: 0, data: draft }).expect(200)
  assert.notEqual((await request(app).get('/api/public/content')).body.content.home.featureTitle, draft.home.featureTitle)
  await agent.post('/api/content/publish').set('X-CSRF-Token', csrf).send({ revision: result.body.revision }).expect(200)
  assert.equal((await request(app).get('/api/public/content')).body.content.home.featureTitle, draft.home.featureTitle)
  await agent.put('/api/content').set('X-CSRF-Token', csrf).send({ revision: 0, data: draft }).expect(409)
  draft.clinic.mapsEmbedUrl = 'https://untrusted.example/embed'
  await agent.put('/api/content').set('X-CSRF-Token', csrf).send({ revision: 1, data: draft }).expect(400)
})
test('uploads decode real images and reject disguised files', async () => {
  await agent.post('/api/media').set('X-CSRF-Token', csrf).attach('image', Buffer.from('<script>alert(1)</script>'), { filename: 'fake.jpg', contentType: 'image/jpeg' }).expect(400)
  const buffer = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#0756aa' } }).png().toBuffer()
  const uploaded = (await agent.post('/api/media').set('X-CSRF-Token', csrf).attach('image', buffer, 'test.png').expect(201)).body
  uploadedFiles.push(uploaded.filename)
  assert.match(uploaded.filename, /^[\w-]+\.webp$/)
  assert.equal(uploaded.width, 10)
  await request(app).get(`/uploads/${uploaded.filename}`).expect(200).expect('Content-Type', /image\/webp/)
})
test('password changes invalidate other sessions and logout revokes access', async () => {
  const other = request.agent(app)
  await other.post('/api/auth/login').send({ email: 'test@example.com', password }).expect(200)
  const result = await agent.post('/api/auth/password').set('X-CSRF-Token', csrf).send({ currentPassword: password, newPassword: 'A-new-private-password-2026!' }).expect(200)
  csrf = result.body.csrf
  await other.get('/api/posts').expect(401)
  await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf).expect(200)
  await agent.get('/api/posts').expect(401)
})
