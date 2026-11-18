import { publicContact, privateContact } from './contact.js'
import { createContactMailer } from './contact-mail.js'
import { createContactNotifications } from './contact-notifications.js'
import express from 'express'
import helmet from 'helmet'
import session from 'express-session'
import MongoStore from 'connect-mongo'
import { loginLimit } from './login-limit.js'
import multer from 'multer'
import { optimizeImage } from './optimize-image.js'
import { mediaStorage, reserveImageStorage, releaseImageStorage } from './media-storage.js'
import { deleteMedia } from './delete-media.js'
import { loginChallengeConfig, verifyLoginChallenge } from './turnstile.js'
import { ObjectId } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config, root, clientRoot } from './config.js'
import { checkPassword, hashPassword, csrfToken } from './security.js'
import { articleSchema, contentSchema, servicesSchema, editSchema, loginSchema, passwordSchema, deleteServiceSchema, deleteMediaSchema } from './schema.js'

const fail = (status, message) => Object.assign(new Error(message), { status })
const id = value => {
  if (!/^[a-f\d]{24}$/i.test(value)) throw fail(400, 'Invalid record ID')
  return new ObjectId(value)
}
const revision = req => {
  if (!Number.isInteger(req.body?.revision) || req.body.revision < 0) throw fail(400, 'A revision number is required. Reload this record.')
  return req.body.revision
}
const saveSession = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()))

export function createApp({ db, client, sessionStore, turnstileFetch, contactMailer } = {}) {
  const app = express()
  const contactNotifications = createContactNotifications({ db, mailer: contactMailer || createContactMailer({ appPassword: config.gmailAppPassword, adminUrl: config.adminOrigin }) })
  if (config.vercel || process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(helmet({
    contentSecurityPolicy: { directives: { scriptSrc: ["'self'", 'https://challenges.cloudflare.com'], frameSrc: ['https://challenges.cloudflare.com'], imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http://localhost:5001', 'http://127.0.0.1:5001'], upgradeInsecureRequests: config.production ? [] : null } },
    strictTransportSecurity: config.production ? undefined : false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }))
  app.use((_req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next() })
  app.use(express.json({ limit: '1mb' }))
  app.get('/api/health', async (_req, res) => {
    await db.command({ ping: 1 })
    res.json({ status: 'ok', database: 'connected' })
  })
  app.use('/api/public', (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  publicContact(app, db, contactNotifications)
  app.get('/api/public/services', async (_req, res) => {
    const content = await db.collection('content').findOne({ _id: 'main' }, { projection: { 'published.services': 1, publishedAt: 1 } })
    if (!content?.published?.services) throw fail(503, 'Services have not been initialized. Run npm run setup.')
    res.json({ schemaVersion: 1, services: content.published.services, publishedAt: content.publishedAt })
  })
  app.get('/api/public/content', async (_req, res) => {
    const [content, posts] = await Promise.all([
      db.collection('content').findOne({ _id: 'main' }),
      db.collection('posts').find({ archived: false, published: { $ne: null } }).sort({ publishedAt: -1, _id: 1 }).toArray(),
    ])
    if (!content?.published) throw fail(503, 'Website content has not been initialized. Run npm run setup.')
    res.json({ schemaVersion: 1, content: content.published, contentUpdatedAt: content.publishedAt,
      articles: posts.map(post => ({ ...post.published, publishedAt: post.publishedAt, updatedAt: post.publishedAt })),
    })
  })
  // Keep existing local uploads readable while migrating; Vercel uses only MongoDB.
  if (!config.vercel) app.use('/uploads', express.static(config.uploads, { maxAge: '1y', immutable: true, dotfiles: 'deny' }))
  app.get('/uploads/:filename', async (req, res, next) => {
    if (!/^[\w-]+\.webp$/.test(req.params.filename)) return next(fail(404, 'Image not found'))
    const image = await db.collection('mediaFiles').findOne({ _id: req.params.filename })
    if (!image) return next(fail(404, 'Image not found'))
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.type('webp').send(Buffer.from(image.data.buffer))
  })
  app.use('/website-assets', express.static(resolve(root, 'seed/assets'), { maxAge: '1h' }))
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  const store = sessionStore || MongoStore.create({ client, dbName: db.databaseName, collectionName: 'sessions', ttl: 8 * 3600 })
  app.use('/api', session({ name: 'agai.sid', secret: config.secret, store, resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: config.production, sameSite: 'strict', maxAge: 8 * 3600 * 1000 },
  }))
  const origins = new Set([config.adminOrigin, config.publicUrl])
  if (config.vercel && process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`)
  if (!config.production) ['http://localhost:5177', 'http://127.0.0.1:5177', 'http://localhost:5001', 'http://127.0.0.1:5001'].forEach(origin => origins.add(origin))
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && !origins.has(req.headers.origin)) return next(fail(403, 'Request origin is not allowed'))
    next()
  })
  app.get('/api/auth/config', (_req, res) => res.json(loginChallengeConfig()))
  app.post('/api/auth/login', loginLimit(db), async (req, res) => {
    const input = loginSchema.parse(req.body)
    await verifyLoginChallenge(input.turnstileToken, turnstileFetch)
    const user = await db.collection('users').findOne({ email: input.email })
    if (!user || !(await checkPassword(input.password, user.passwordHash))) throw fail(401, 'Email or password is incorrect')
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()))
    req.session.userId = user._id.toString()
    req.session.authVersion = user.authVersion
    req.session.csrf = csrfToken()
    await saveSession(req)
    res.json({ user: { name: user.name, email: user.email }, csrf: req.session.csrf })
  })
  app.use('/api', async (req, _res, next) => {
    if (!req.session?.userId) return next(fail(401, 'Sign in to continue'))
    const user = await db.collection('users').findOne({ _id: id(req.session.userId) })
    if (!user || user.authVersion !== req.session.authVersion) return next(fail(401, 'Your session has expired. Sign in again.'))
    req.user = user
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-CSRF-Token') !== req.session.csrf) return next(fail(403, 'Your security token expired. Refresh the page and try again.'))
    next()
  })
  privateContact(app, db, contactNotifications)
  app.get('/api/auth/me', (req, res) => res.json({ user: { name: req.user.name, email: req.user.email }, csrf: req.session.csrf }))
  app.post('/api/auth/logout', (req, res, next) => req.session.destroy(error => {
    if (error) return next(error)
    res.clearCookie('agai.sid', { httpOnly: true, secure: config.production, sameSite: 'strict' }).json({ ok: true })
  }))
  app.post('/api/auth/password', loginLimit(db), async (req, res) => {
    const input = passwordSchema.parse(req.body)
    if (!(await checkPassword(input.currentPassword, req.user.passwordHash))) throw fail(400, 'Current password is incorrect')
    await db.collection('users').updateOne({ _id: req.user._id }, { $set: { passwordHash: await hashPassword(input.newPassword) }, $inc: { authVersion: 1 } })
    req.session.authVersion = req.user.authVersion + 1
    req.session.csrf = csrfToken()
    await saveSession(req)
    res.json({ ok: true, csrf: req.session.csrf })
  })
  async function activity(req, action, label) {
    // Activity history must not turn a completed content write into a failed save.
    await db.collection('activity').insertOne({ action, label, user: req.user.email, createdAt: new Date() }).catch(error => console.error('Activity record failed:', error.message))
  }
  app.get('/api/dashboard', async (_req, res) => {
    const [posts, media, recent, content] = await Promise.all([
      db.collection('posts').find({}, { projection: { published: 1, revision: 1, publishedRevision: 1, archived: 1 } }).toArray(),
      db.collection('media').countDocuments(), db.collection('activity').find().sort({ createdAt: -1 }).limit(8).toArray(),
      db.collection('content').findOne({ _id: 'main' }, { projection: { updatedAt: 1, publishedAt: 1, revision: 1, publishedRevision: 1 } }),
    ])
    res.json({ total: posts.filter(post => !post.archived).length, published: posts.filter(post => post.published && !post.archived).length,
      drafts: posts.filter(post => !post.archived && (!post.published || post.revision !== post.publishedRevision)).length,
      media, recent, content, websiteUrl: config.websiteUrl, publicApiUrl: config.publicUrl,
    })
  })
  app.get('/api/posts', async (_req, res) => res.json(await db.collection('posts').find().sort({ updatedAt: -1 }).toArray()))
  app.get('/api/posts/:id', async (req, res) => {
    const post = await db.collection('posts').findOne({ _id: id(req.params.id) })
    if (!post) throw fail(404, 'Article not found')
    res.json(post)
  })
  app.post('/api/posts', async (req, res) => {
    const draft = articleSchema.parse(req.body)
    const post = { draft, published: null, revision: 0, publishedRevision: null, archived: false, createdAt: new Date(), updatedAt: new Date() }
    const result = await db.collection('posts').insertOne(post)
    await activity(req, 'Created draft', draft.title)
    res.status(201).json({ ...post, _id: result.insertedId })
  })
  app.put('/api/posts/:id', async (req, res) => {
    const input = editSchema(articleSchema).parse(req.body)
    const post = await db.collection('posts').findOneAndUpdate({ _id: id(req.params.id), revision: input.revision, archived: false },
      { $set: { draft: input.data, updatedAt: new Date() }, $inc: { revision: 1 } }, { returnDocument: 'after' })
    if (!post) throw fail(409, 'This article changed in another window or was archived. Reload before saving.')
    await activity(req, 'Saved draft', post.draft.title)
    res.json(post)
  })
  app.delete('/api/posts/:id', async (req, res) => {
    const filter = { _id: id(req.params.id), revision: revision(req) }
    const post = await db.collection('posts').findOneAndDelete(filter)
    if (!post) {
      const exists = await db.collection('posts').findOne({ _id: filter._id }, { projection: { _id: 1 } })
      if (!exists) throw fail(404, 'Article not found')
      throw fail(409, 'Article changed in another window. Reload before deleting.')
    }
    await activity(req, 'Deleted article', post.draft.title)
    res.json({ ok: true })
  })
  app.post('/api/posts/:id/:action', async (req, res) => {
    const action = req.params.action
    if (!['publish', 'unpublish'].includes(action)) throw fail(404, 'Action not found')
    const filter = { _id: id(req.params.id), revision: revision(req) }
    const existing = await db.collection('posts').findOne(filter)
    if (!existing) throw fail(409, 'Article changed. Reload before continuing.')
    if (existing.archived) throw fail(400, 'This legacy archived article can only be permanently deleted.')
    const nextRevision = existing.revision + 1
    const update = { updatedAt: new Date(), revision: nextRevision }
    if (action === 'publish') Object.assign(update, { published: articleSchema.parse(existing.draft), publishedRevision: nextRevision, publishedAt: new Date() })
    if (action === 'unpublish') Object.assign(update, { published: null, publishedRevision: null })
    const post = await db.collection('posts').findOneAndUpdate(filter, { $set: update }, { returnDocument: 'after' })
    if (!post) throw fail(409, 'Article changed. Reload before continuing.')
    await activity(req, ({ publish: 'Published', unpublish: 'Unpublished' })[action], post.draft.title)
    res.json(post)
  })
  // One MongoDB record remains canonical for both legacy content and service APIs.
  const serviceRecord = content => ({
    draft: { services: content.draft.services }, published: { services: content.published?.services || [] },
    revision: content.revision,
    publishedRevision: JSON.stringify(content.draft.services) === JSON.stringify(content.published?.services) ? content.revision : null,
  })
  function requireServiceDeletionFlow(existing, services) {
    const ids = new Set(services.map(service => service.id))
    const saved = [...existing.draft.services, ...(existing.published?.services || [])]
    if (saved.some(service => !ids.has(service.id))) throw fail(400, 'Use Delete service and confirm your admin password to remove a saved service.')
  }
  app.get('/api/services', async (_req, res) => {
    const content = await db.collection('content').findOne({ _id: 'main' })
    if (!content) throw fail(503, 'Run npm run setup to initialize services')
    res.json(serviceRecord(content))
  })
  app.put('/api/services', async (req, res) => {
    const input = editSchema(servicesSchema).parse(req.body)
    const existing = await db.collection('content').findOne({ _id: 'main', revision: input.revision })
    if (!existing) throw fail(409, 'Services changed in another window. Reload before saving.')
    requireServiceDeletionFlow(existing, input.data)
    const content = await db.collection('content').findOneAndUpdate({ _id: 'main', revision: input.revision },
      { $set: { 'draft.services': input.data, updatedAt: new Date() }, $inc: { revision: 1 } }, { returnDocument: 'after' })
    if (!content) throw fail(409, 'Services changed in another window. Reload before saving.')
    await activity(req, 'Saved draft', 'Services')
    res.json(serviceRecord(content))
  })
  app.post('/api/services/publish', async (req, res) => {
    const filter = { _id: 'main', revision: revision(req) }
    const existing = await db.collection('content').findOne(filter)
    if (!existing) throw fail(409, 'Services changed. Reload before publishing.')
    const services = servicesSchema.parse(existing.draft.services)
    requireServiceDeletionFlow(existing, services)
    const published = { ...existing.published, services }
    const update = { 'published.services': services, publishedAt: new Date() }
    if (JSON.stringify(published) === JSON.stringify(existing.draft)) update.publishedRevision = existing.revision
    const content = await db.collection('content').findOneAndUpdate(filter, { $set: update }, { returnDocument: 'after' })
    if (!content) throw fail(409, 'Services changed. Reload before publishing.')
    await activity(req, 'Published', 'Services')
    res.json(serviceRecord(content))
  })
  app.delete('/api/services/:id', loginLimit(db, { scope: 'service-delete', message: 'Too many password confirmation attempts. Try again in 15 minutes.' }), async (req, res) => {
    const input = deleteServiceSchema.parse(req.body)
    if (!(await checkPassword(input.password, req.user.passwordHash))) throw fail(403, 'Admin password is incorrect. Service was not deleted.')
    const existing = await db.collection('content').findOne({ _id: 'main', revision: input.revision })
    if (!existing) throw fail(409, 'Services changed in another window. Reload before deleting.')
    const service = [...existing.draft.services, ...(existing.published?.services || [])].find(item => item.id === req.params.id)
    if (!service) throw fail(404, 'Service not found')
    const services = existing.draft.services.filter(item => item.id !== service.id)
    const publishedServices = existing.published?.services?.filter(item => item.id !== service.id)
    if (!services.length || (publishedServices && !publishedServices.length)) throw fail(400, 'Keep at least one service. Add and publish a replacement before deleting this service.')
    const nextRevision = existing.revision + 1
    const update = { 'draft.services': services, revision: nextRevision, updatedAt: new Date() }
    const removedPublished = publishedServices?.length !== existing.published?.services?.length
    if (removedPublished) Object.assign(update, { 'published.services': publishedServices, publishedAt: new Date() })
    const published = existing.published ? { ...existing.published, services: publishedServices } : null
    if (JSON.stringify({ ...existing.draft, services }) === JSON.stringify(published)) update.publishedRevision = nextRevision
    // Publishing can change the public copy without changing the draft revision.
    const filter = { _id: 'main', revision: input.revision, publishedAt: existing.publishedAt ?? null }
    const content = await db.collection('content').findOneAndUpdate(filter, { $set: update }, { returnDocument: 'after' })
    if (!content) throw fail(409, 'Services changed in another window. Reload before deleting.')
    await activity(req, 'Deleted service', service.title)
    res.json(serviceRecord(content))
  })
  app.get('/api/content', async (_req, res) => {
    const content = await db.collection('content').findOne({ _id: 'main' })
    if (!content) throw fail(503, 'Run npm run setup to initialize website content')
    res.json(content)
  })
  app.put('/api/content', async (req, res) => {
    const input = editSchema(contentSchema).parse(req.body)
    const existing = await db.collection('content').findOne({ _id: 'main', revision: input.revision })
    if (!existing) throw fail(409, 'Website content changed in another window. Reload before saving.')
    requireServiceDeletionFlow(existing, input.data.services)
    const content = await db.collection('content').findOneAndUpdate({ _id: 'main', revision: input.revision }, { $set: { draft: input.data, updatedAt: new Date() }, $inc: { revision: 1 } }, { returnDocument: 'after' })
    if (!content) throw fail(409, 'Website content changed in another window. Reload before saving.')
    await activity(req, 'Saved draft', 'Website content')
    res.json(content)
  })
  app.post('/api/content/publish', async (req, res) => {
    const filter = { _id: 'main', revision: revision(req) }
    const existing = await db.collection('content').findOne(filter)
    if (!existing) throw fail(409, 'Website content changed. Reload before publishing.')
    requireServiceDeletionFlow(existing, existing.draft.services)
    const content = await db.collection('content').findOneAndUpdate(filter, { $set: { published: contentSchema.parse(existing.draft), publishedRevision: existing.revision, publishedAt: new Date() } }, { returnDocument: 'after' })
    if (!content) throw fail(409, 'Website content changed. Reload before publishing.')
    await activity(req, 'Published', 'Website content')
    res.json(content)
  })
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0, parts: 1 }, fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) })
  app.get('/api/media', async (_req, res) => res.json(await db.collection('media').find().sort({ createdAt: -1 }).toArray()))
  app.get('/api/media/storage', async (_req, res) => res.json(await mediaStorage(db)))
  app.delete('/api/media/:id', loginLimit(db, { scope: 'media-delete', message: 'Too many password confirmation attempts. Try again in 15 minutes.' }), async (req, res) => {
    const mediaId = id(req.params.id)
    const input = deleteMediaSchema.parse(req.body)
    if (!(await checkPassword(input.password, req.user.passwordHash))) throw fail(403, 'Admin password is incorrect. Image was not deleted.')
    const removed = await deleteMedia(db, mediaId, config)
    await activity(req, 'Deleted image', removed.originalName)
    res.json({ deletedId: removed._id })
  })
  app.post('/api/media', upload.single('image'), async (req, res) => {
    if (!req.file) throw fail(400, 'Choose a JPEG, PNG or WebP image under 3 MB')
    const filename = `${randomUUID()}.webp`
    let output
    try {
      output = await optimizeImage(req.file.buffer)
    } catch { throw fail(400, 'This file could not be decoded as a supported image') }
    const record = { filename, originalName: req.file.originalname.slice(0, 200), url: `${config.publicUrl}/uploads/${filename}`, width: output.info.width, height: output.info.height, size: output.info.size, createdAt: new Date() }
    await reserveImageStorage(db, output.data.length)
    let result
    try {
      await db.collection('mediaFiles').insertOne({ _id: filename, data: output.data })
      result = await db.collection('media').insertOne(record)
    } catch (error) {
      await db.collection('mediaFiles').deleteOne({ _id: filename })
      await releaseImageStorage(db, output.data.length)
      throw error
    }
    await activity(req, 'Uploaded image', record.originalName)
    res.status(201).json({ ...record, _id: result.insertedId })
  })
  app.use('/api', (_req, _res, next) => next(fail(404, 'API route not found')))
  if (!config.vercel && existsSync(resolve(clientRoot, 'dist/index.html'))) {
    app.use(express.static(resolve(clientRoot, 'dist')))
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(clientRoot, 'dist/index.html')))
  }
  app.use((error, _req, res, _next) => {
    if (error.name === 'ZodError') return res.status(400).json({ message: error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') })
    if (error.code === 11000) return res.status(409).json({ message: 'This article URL is already in use. Choose a unique slug.' })
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Images must be smaller than 3 MB' })
    const status = error.status || (error instanceof multer.MulterError ? 400 : 500)
    if (status === 500) console.error(error)
    res.status(status).json({ message: status === 500 ? 'Something went wrong. Please try again.' : error.message })
  })
  return app
}
