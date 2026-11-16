import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { connectDatabase } from '../src/db.js'
import { root } from '../src/config.js'
import { hashPassword } from '../src/security.js'
import { articleSchema, contentSchema } from '../src/schema.js'

const { client, db } = await connectDatabase()
try {
  if (!(await db.collection('users').findOne())) {
    const email = process.env.ADMIN_EMAIL || 'admin@agaiphysiotherapy.com'
    const password = randomBytes(18).toString('base64url')
    await db.collection('users').insertOne({ email, name: 'AGAI Admin', passwordHash: await hashPassword(password), authVersion: 1, createdAt: new Date() })
    mkdirSync(resolve(root, '.local'), { recursive: true })
    writeFileSync(resolve(root, '.local/admin-credentials.txt'), `AGAI Studio local administrator\nURL: http://localhost:5177\nEmail: ${email}\nPassword: ${password}\n\nChange this password in Settings after signing in. This file is ignored by Git.\n`, { mode: 0o600 })
    console.log('Administrator created. Sign-in details saved to .local/admin-credentials.txt')
  } else console.log('Administrator already exists; credentials unchanged.')
  const seed = JSON.parse(readFileSync(resolve(root, 'seed/content.json'), 'utf8'))
  const now = new Date()
  const content = contentSchema.parse(seed.content)
  await db.collection('content').updateOne({ _id: 'main' }, { $setOnInsert: { draft: content, published: content, revision: 0, publishedRevision: 0, updatedAt: now, publishedAt: now } }, { upsert: true })
  const initialized = await db.collection('settings').findOne({ _id: 'initial-import' })
  if (!initialized && await db.collection('posts').countDocuments() === 0) {
    for (const entry of seed.articles) {
      const article = articleSchema.parse(entry)
      await db.collection('posts').insertOne({ draft: article, published: article, revision: 0, publishedRevision: 0, createdAt: now, updatedAt: now, publishedAt: now, archived: false })
    }
  }
  await db.collection('settings').updateOne({ _id: 'initial-import' }, { $setOnInsert: { importedAt: now } }, { upsert: true })
  console.log('Initial website content is ready. Existing records were preserved.')
} finally { await client.close() }
