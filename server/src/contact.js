import { z } from 'zod'
import { config } from './config.js'
import { loginLimit } from './login-limit.js'
import { notificationSummary } from './contact-notifications.js'

const schema = z.object({
  submissionId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  email: z.union([z.string().trim().email().max(200), z.literal('')]).default(''),
  phone: z.string().trim().max(30).refine(value => /^\+?[\d\s().-]+$/.test(value) && value.replace(/\D/g, '').length >= 7 && value.replace(/\D/g, '').length <= 15, 'Enter a phone number with 7–15 digits.'),
  message: z.string().trim().min(10).max(1500),
  service: z.string().trim().max(180).default('General enquiry'),
  website: z.string().max(200).default(''),
})

export function publicContact(app, db, notifications) {
  const origins = new Set([new URL(config.websiteUrl).origin, new URL(config.publicUrl).origin])
  // Support the canonical website and its www alias.
  const website = new URL(config.websiteUrl)
  if (website.hostname.startsWith('www.')) website.hostname = website.hostname.slice(4)
  else website.hostname = `www.${website.hostname}`
  origins.add(website.origin)
  app.use('/api/public/contact', (req, res, next) => {
    res.removeHeader('Access-Control-Allow-Origin')
    res.vary('Origin')
    const origin = req.get('Origin')
    const local = !config.production && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '')
    if (origin && !origins.has(origin) && !local) return res.status(403).json({ message: 'Request origin is not allowed' })
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })
  app.post('/api/public/contact', loginLimit(db, { scope: 'contact', message: 'Too many enquiries. Please try again in 15 minutes.' }), async (req, res) => {
    const { website, submissionId, ...input } = schema.parse(req.body)
    if (website) return res.status(400).json({ message: 'Unable to submit this enquiry.' })
    // A retry after a lost response must not create a second enquiry.
    try {
      await db.collection('contactSubmissions').updateOne({ _id: submissionId }, { $setOnInsert: { ...input, createdAt: new Date(), emailNotification: { status: 'pending', attempts: 0 } } }, { upsert: true })
    } catch (error) { if (error.code !== 11000) throw error }
    // Await the bounded mail attempt so Vercel cannot freeze it after the response.
    // The saved enquiry remains successful even when email or status tracking fails.
    await notifications.send(submissionId).catch(() => console.error('Contact email status could not be updated. Check the admin inbox.'))
    res.status(201).json({ ok: true, reference: submissionId })
  })
}

export function privateContact(app, db, notifications) {
  app.post('/api/contact-submissions/:id/notification', loginLimit(db, { scope: 'contact-email', message: 'Too many email attempts. Please try again later.' }), async (req, res) => {
    const id = z.string().uuid().parse(req.params.id)
    const item = await db.collection('contactSubmissions').findOne({ _id: id })
    if (!item) return res.status(404).json({ message: 'Enquiry not found' })
    if (!item.emailNotification) return res.status(409).json({ message: 'Email notifications were not enabled for this earlier enquiry.' })
    const notification = await notifications.send(id)
    res.json({ notification })
  })
  app.get('/api/contact-submissions', async (req, res) => {
    const page = z.coerce.number().int().min(1).max(100000).parse(req.query.page || 1)
    const search = z.string().trim().max(200).parse(req.query.search ?? '')
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const literal = { $regex: escape(search), $options: 'i' }
    const digits = search.replace(/\D/g, '')
    const phone = digits && /^[+\d\s().-]+$/.test(search)
      ? { $regex: digits.split('').join('[^0-9]*') }
      : literal
    const filter = search ? { $or: [{ name: literal }, { email: literal }, { phone }] } : {}
    const pageSize = 20
    const [items, total] = await Promise.all([
      db.collection('contactSubmissions').find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
      db.collection('contactSubmissions').countDocuments(filter),
    ])
    res.json({ items: items.map(item => ({ ...item, emailNotification: notificationSummary(item.emailNotification) })), total, page, pageSize, emailConfigured: notifications.configured })
  })
}
