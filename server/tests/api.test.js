import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import request from 'supertest'
import session from 'express-session'
import sharp from 'sharp'
import { execFileSync } from 'node:child_process'
import { ObjectId } from 'mongodb'
import { connectDatabase } from '../src/db.js'
import { createApp } from '../src/app.js'
import { checkPassword, hashPassword } from '../src/security.js'
import { config, root } from '../src/config.js'
import { articleSchema, contentSchema } from '../src/schema.js'

const databaseName = `agai_cms_test_${Date.now()}`
const password = 'Test-only-password-2026!'
let client, db, app, agent, csrf, post
const seed = JSON.parse(readFileSync(resolve(root, 'seed/content.json'), 'utf8'))

test('additional services require valid unique IDs, categories and complete content', () => {
  const data = structuredClone(seed.content)
  const additional = { ...data.services[0], id: 'movement-coaching' }
  data.services.push(additional)
  assert.equal(contentSchema.safeParse(data).success, true)
  for (const invalid of [
    { id: data.services[0].id }, { id: '../unsafe' }, { id: 'not-sure' },
    { category: 'unknown' }, { icon: 'script' }, { title: '' }, { image: '' }, { focus: [] },
  ]) {
    data.services[data.services.length - 1] = { ...additional, ...invalid }
    assert.equal(contentSchema.safeParse(data).success, false)
  }
  data.services = Array.from({ length: 51 }, (_, index) => ({ ...additional, id: `service-${index}` }))
  assert.equal(contentSchema.safeParse(data).success, false)
})

test('rich blog documents preserve formatting and reject unsafe or empty content', () => {
  const draft = { ...seed.articles[0], sections: [], body: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2, textAlign: 'center', onclick: 'alert(1)' }, content: [{ type: 'text', text: 'A heading' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Formatted words', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com' } }] }] },
  ] } }
  const parsed = articleSchema.parse(draft)
  assert.equal(parsed.body.content[0].attrs.textAlign, 'center')
  assert.equal(parsed.body.content[0].attrs.onclick, undefined)
  assert.equal(parsed.body.content[1].content[0].marks[0].type, 'bold')
  assert.match(parsed.sections[0].text, /Formatted words/)
  const unsafe = structuredClone(draft)
  unsafe.body.content[1].content[0].marks[1].attrs.href = 'javascript:alert(1)'
  assert.equal(articleSchema.safeParse(unsafe).success, false)
  assert.equal(articleSchema.safeParse({ ...draft, body: { type: 'doc', content: [{ type: 'script' }] } }).success, false)
  assert.equal(articleSchema.safeParse({ ...draft, body: { type: 'doc', content: [{ type: 'paragraph' }] } }).success, false)
  assert.equal(articleSchema.safeParse(seed.articles[0]).success, true)
})
before(async () => {
  ;({ client, db } = await connectDatabase(databaseName))
  await db.collection('users').insertOne({ email: 'test@example.com', name: 'Test editor', passwordHash: await hashPassword(password), authVersion: 1 })
  await db.collection('content').insertOne({ _id: 'main', draft: seed.content, published: seed.content, revision: 0, publishedRevision: 0, publishedAt: new Date() })
  app = createApp({ db, client, sessionStore: new session.MemoryStore() })
  agent = request.agent(app)
})
after(async () => {
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
test('permanent deletion requires authentication, CSRF and the current revision', async () => {
  const path = `/api/posts/${post._id}`
  await request(app).delete(path).send({ revision: post.revision }).expect(401)
  await agent.delete(path).send({ revision: post.revision }).expect(403)
  await agent.delete(path).set('X-CSRF-Token', csrf).expect(400)
  await agent.delete(path).set('X-CSRF-Token', csrf).send({ revision: post.revision - 1 }).expect(409)
  await agent.post(`${path}/archive`).set('X-CSRF-Token', csrf).send({ revision: post.revision }).expect(404)
  await agent.post(`${path}/restore`).set('X-CSRF-Token', csrf).send({ revision: post.revision }).expect(404)
  assert.ok(await db.collection('posts').findOne({ _id: new ObjectId(post._id) }))
  assert.equal((await request(app).get('/api/public/content')).body.articles.length, 1)
})

test('permanent deletion removes the entire database record and public article', async () => {
  await agent.delete(`/api/posts/${post._id}`).set('X-CSRF-Token', csrf).send({ revision: post.revision }).expect(200)
  assert.equal(await db.collection('posts').findOne({ _id: new ObjectId(post._id) }), null)
  assert.equal((await request(app).get('/api/public/content')).body.articles.length, 0)
  assert.equal((await agent.get('/api/posts')).body.some(item => item._id === post._id), false)
  assert.equal((await agent.get('/api/dashboard')).body.total, 0)
  await agent.get(`/api/posts/${post._id}`).expect(404)
  await agent.delete(`/api/posts/${post._id}`).set('X-CSRF-Token', csrf).send({ revision: post.revision }).expect(404)
})

test('drafts and legacy archived posts can also be permanently deleted', async () => {
  for (const archived of [false, true]) {
    const draft = (await agent.post('/api/posts').set('X-CSRF-Token', csrf).send({ ...seed.articles[0], slug: `delete-draft-${archived}` }).expect(201)).body
    const _id = new ObjectId(draft._id)
    if (archived) await db.collection('posts').updateOne({ _id }, { $set: { archived: true } })
    await agent.delete(`/api/posts/${draft._id}`).set('X-CSRF-Token', csrf).send({ revision: draft.revision }).expect(200)
    assert.equal(await db.collection('posts').findOne({ _id }), null)
  }
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
test('new services stay private until published and persist alongside existing services', async () => {
  const original = (await request(app).get('/api/public/content').expect(200)).body.content.services
  const record = (await agent.get('/api/content').expect(200)).body
  const data = structuredClone(record.draft)
  const additional = { ...data.services[0], id: 'movement-coaching', title: 'Movement coaching' }
  data.services.push(additional)
  const saved = (await agent.put('/api/content').set('X-CSRF-Token', csrf).send({ revision: record.revision, data }).expect(200)).body
  assert.deepEqual((await request(app).get('/api/public/content')).body.content.services, original)
  assert.equal((await agent.get('/api/content')).body.draft.services.at(-1).id, additional.id)
  await agent.post('/api/content/publish').set('X-CSRF-Token', csrf).send({ revision: saved.revision }).expect(200)
  const published = (await request(app).get('/api/public/content')).body.content.services
  assert.deepEqual(published.slice(0, -1), original)
  assert.equal(published.at(-1).title, additional.title)
})

test('dedicated services API protects drafts, persists in MongoDB and isolates other content', async () => {
  await request(app).get('/api/services').expect(401)
  const before = (await request(app).get('/api/public/content')).body.content
  const content = (await agent.get('/api/content')).body
  const draft = structuredClone(content.draft)
  draft.home.featureTitle = 'Unpublished home change'
  await agent.put('/api/content').set('X-CSRF-Token', csrf).send({ revision: content.revision, data: draft }).expect(200)
  const record = (await agent.get('/api/services').expect(200)).body
  assert.equal(record.draft.home, undefined)
  const services = structuredClone(record.draft.services)
  services[0].title = 'Updated through services API'
  await agent.put('/api/services').send({ revision: record.revision, data: services }).expect(403)
  await agent.put('/api/services').set('X-CSRF-Token', csrf).send({ revision: record.revision, data: [...services, services[0]] }).expect(400)
  const saved = (await agent.put('/api/services').set('X-CSRF-Token', csrf).send({ revision: record.revision, data: services }).expect(200)).body
  await agent.put('/api/services').set('X-CSRF-Token', csrf).send({ revision: record.revision, data: services }).expect(409)
  await agent.post('/api/services/publish').set('X-CSRF-Token', csrf).send({ revision: record.revision }).expect(409)
  const privateResult = await request(app).get('/api/public/services').expect(200)
  assert.equal(privateResult.headers['access-control-allow-origin'], '*')
  assert.equal(privateResult.headers['cache-control'], 'no-store')
  assert.deepEqual(privateResult.body.services, before.services)
  assert.equal(privateResult.body.draft, undefined)
  await agent.post('/api/services/publish').set('X-CSRF-Token', csrf).send({ revision: saved.revision }).expect(200)
  const publicContent = (await request(app).get('/api/public/content')).body.content
  assert.deepEqual(publicContent.home, before.home)
  assert.equal((await db.collection('content').findOne({ _id: 'main' })).draft.home.featureTitle, draft.home.featureTitle)
  const coldApp = createApp({ db, client, sessionStore: new session.MemoryStore() })
  const reloaded = (await request(coldApp).get('/api/public/services').expect(200)).body
  assert.deepEqual(reloaded.services, services)
})

test('service deletion requires the signed-in admin password, CSRF and current revision', async () => {
  const before = await db.collection('content').findOne({ _id: 'main' })
  const path = `/api/services/${before.draft.services[0].id}`
  await request(app).delete(path).send({ revision: before.revision, password }).expect(401)
  await agent.delete(path).send({ revision: before.revision, password }).expect(403)
  await agent.delete(path).set('X-CSRF-Token', csrf).send({ revision: before.revision }).expect(400)
  await agent.delete(path).set('X-CSRF-Token', csrf).send({ revision: before.revision, password: 'wrong' }).expect(403)
  await agent.delete(path).set('X-CSRF-Token', csrf).send({ revision: before.revision - 1, password }).expect(409)
  await agent.delete('/api/services/does-not-exist').set('X-CSRF-Token', csrf).send({ revision: before.revision, password }).expect(404)
  assert.deepEqual(await db.collection('content').findOne({ _id: 'main' }), before)
})

test('bulk save and legacy publishing cannot bypass service password confirmation', async () => {
  const before = await db.collection('content').findOne({ _id: 'main' })
  const services = before.draft.services.slice(1)
  await agent.put('/api/services').set('X-CSRF-Token', csrf).send({ revision: before.revision, data: services }).expect(400)
  await agent.put('/api/content').set('X-CSRF-Token', csrf).send({ revision: before.revision, data: { ...before.draft, services } }).expect(400)
  // An older saved draft must not remove a published service via publish either.
  try {
    await db.collection('content').updateOne({ _id: 'main' }, { $set: { 'draft.services': services } })
    await agent.post('/api/services/publish').set('X-CSRF-Token', csrf).send({ revision: before.revision }).expect(400)
    await agent.post('/api/content/publish').set('X-CSRF-Token', csrf).send({ revision: before.revision }).expect(400)
  } finally { await db.collection('content').replaceOne({ _id: 'main' }, before) }
})

test('correct password permanently deletes both service copies without publishing other edits', async () => {
  const before = await db.collection('content').findOne({ _id: 'main' })
  const serviceId = before.draft.services[0].id
  const result = (await agent.delete(`/api/services/${serviceId}`).set('X-CSRF-Token', csrf).send({ revision: before.revision, password }).expect(200)).body
  const after = await db.collection('content').findOne({ _id: 'main' })
  assert.deepEqual(after.draft.services, before.draft.services.filter(item => item.id !== serviceId))
  assert.deepEqual(after.published.services, before.published.services.filter(item => item.id !== serviceId))
  assert.deepEqual(after.draft.home, before.draft.home)
  assert.deepEqual(after.published.home, before.published.home)
  assert.equal(result.revision, before.revision + 1)
  assert.equal((await request(app).get('/api/public/services')).body.services.some(item => item.id === serviceId), false)
  assert.equal((await request(app).get('/api/public/content')).body.content.services.some(item => item.id === serviceId), false)
  // A stale editor cannot resurrect the deleted service with an old save.
  await agent.put('/api/services').set('X-CSRF-Token', csrf).send({ revision: before.revision, data: before.draft.services }).expect(409)
  await agent.delete(`/api/services/${serviceId}`).set('X-CSRF-Token', csrf).send({ revision: result.revision, password }).expect(404)

  const draftOnly = { ...after.draft.services[0], id: 'delete-private-service' }
  const saved = (await agent.put('/api/services').set('X-CSRF-Token', csrf).send({ revision: after.revision, data: [...after.draft.services, draftOnly] }).expect(200)).body
  await agent.delete(`/api/services/${draftOnly.id}`).set('X-CSRF-Token', csrf).send({ revision: saved.revision, password }).expect(200)
  const final = await db.collection('content').findOne({ _id: 'main' })
  assert.equal(final.draft.services.some(item => item.id === draftOnly.id), false)
  assert.deepEqual(final.published, after.published)
  assert.deepEqual(final.publishedAt, after.publishedAt)
})

test('service deletion preserves the required last service', async () => {
  const before = await db.collection('content').findOne({ _id: 'main' })
  const service = before.draft.services[0]
  try {
    await db.collection('content').updateOne({ _id: 'main' }, { $set: { 'draft.services': [service], 'published.services': [service] } })
    await agent.delete(`/api/services/${service.id}`).set('X-CSRF-Token', csrf).send({ revision: before.revision, password }).expect(400)
    assert.equal((await db.collection('content').findOne({ _id: 'main' })).draft.services.length, 1)
  } finally { await db.collection('content').replaceOne({ _id: 'main' }, before) }
})

test('service password confirmation is rate limited independently of sign-in', async () => {
  const before = await db.collection('content').findOne({ _id: 'main' })
  const path = `/api/services/${before.draft.services[0].id}`
  await db.collection('loginLimits').deleteMany({ _id: /^service-delete:/ })
  for (let attempt = 0; attempt < 20; attempt++) {
    await agent.delete(path).set('X-CSRF-Token', csrf).send({ revision: before.revision, password: 'wrong' }).expect(403)
  }
  const limited = await agent.delete(path).set('X-CSRF-Token', csrf).send({ revision: before.revision, password }).expect(429)
  assert.ok(Number(limited.headers['retry-after']) > 0)
  assert.deepEqual(await db.collection('content').findOne({ _id: 'main' }), before)
  await agent.get('/api/auth/me').expect(200)
})

test('uploads decode real images and reject disguised files', async () => {
  await agent.post('/api/media').set('X-CSRF-Token', csrf).attach('image', Buffer.from('<script>alert(1)</script>'), { filename: 'fake.jpg', contentType: 'image/jpeg' }).expect(400)
  const buffer = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#0756aa' } }).png().toBuffer()
  const uploaded = (await agent.post('/api/media').set('X-CSRF-Token', csrf).attach('image', buffer, 'test.png').expect(201)).body
  assert.match(uploaded.filename, /^[\w-]+\.webp$/)
  assert.equal(uploaded.width, 10)
  await request(app).get(`/uploads/${uploaded.filename}`).expect(200).expect('Content-Type', /image\/webp/)
  const coldApp = createApp({ db, client, sessionStore: new session.MemoryStore() })
  await request(coldApp).get(`/uploads/${uploaded.filename}`).expect(200).expect('Cache-Control', /immutable/)
  assert.ok(await db.collection('mediaFiles').findOne({ _id: uploaded.filename }))
  const media = await agent.get('/api/media').expect(200)
  assert.equal(media.body[0].data, undefined)
  await agent.post('/api/media').set('X-CSRF-Token', csrf).attach('image', Buffer.alloc(3 * 1024 * 1024 + 1), 'large.png').expect(400)
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

test('login throttling is shared by separate application instances', async () => {
  await db.collection('loginLimits').deleteMany({})
  const second = createApp({ db, client, sessionStore: new session.MemoryStore() })
  for (let attempt = 0; attempt < 20; attempt++) {
    await request(attempt % 2 ? second : app).post('/api/auth/login').send({}).expect(400)
  }
  await request(second).post('/api/auth/login').send({}).expect(429).expect('Retry-After', /\d+/)
})

test('Vercel HTTPS proxy supports secure sessions and MongoDB-backed media', async () => {
  await db.collection('loginLimits').deleteMany({})
  const original = { production: config.production, vercel: config.vercel }
  Object.assign(config, { production: true, vercel: true })
  try {
    const serverless = createApp({ db, client, sessionStore: new session.MemoryStore() })
    const login = await request(serverless).post('/api/auth/login')
      .set('X-Forwarded-Proto', 'https').set('Origin', config.publicUrl)
      .send({ email: 'test@example.com', password: 'A-new-private-password-2026!' }).expect(200)
    assert.match(login.headers['set-cookie'][0], /; Secure/)
    const cookie = login.headers['set-cookie'][0].split(';')[0]
    await request(serverless).get('/api/auth/me').set('X-Forwarded-Proto', 'https').set('Cookie', cookie).expect(200)
    const media = await db.collection('media').findOne()
    const response = await request(serverless).get(`/uploads/${media.filename}`).expect(200)
    const stored = await db.collection('mediaFiles').findOne({ _id: media.filename })
    assert.deepEqual(response.body, Buffer.from(stored.data.buffer))
    await request(serverless).get('/uploads/not-present.webp').expect(404)
  } finally { Object.assign(config, original) }
})

test('setup stores only a MongoDB password hash and preserves existing credentials', async () => {
  const setupName = `${databaseName}_setup`
  const setupDb = client.db(setupName)
  const bootstrapPassword = 'Bootstrap-test-password-2026!'
  const env = { ...process.env, MONGODB_URI: config.mongoUri, MONGODB_DB: setupName,
    NODE_ENV: 'production', SESSION_SECRET: config.secret, ADMIN_EMAIL: 'setup@example.com', ADMIN_PASSWORD: bootstrapPassword }
  try {
    const output = execFileSync(process.execPath, [resolve(root, 'scripts/setup.js')], { env, encoding: 'utf8' })
    assert.equal(output.includes(bootstrapPassword), false)
    const user = await setupDb.collection('users').findOne()
    assert.equal(user.email, 'setup@example.com')
    assert.equal(user.password, undefined)
    assert.equal(await checkPassword(bootstrapPassword, user.passwordHash), true)
    execFileSync(process.execPath, [resolve(root, 'scripts/setup.js')], { env: { ...env, ADMIN_EMAIL: '', ADMIN_PASSWORD: '' }, encoding: 'utf8' })
    assert.equal((await setupDb.collection('users').findOne()).passwordHash, user.passwordHash)
    await setupDb.collection('users').deleteMany({})
    assert.throws(() => execFileSync(process.execPath, [resolve(root, 'scripts/setup.js')], {
      env: { ...env, ADMIN_EMAIL: '', ADMIN_PASSWORD: '' }, stdio: 'pipe',
    }))
    assert.equal(await setupDb.collection('users').countDocuments(), 0)
  } finally { await setupDb.dropDatabase() }
})
