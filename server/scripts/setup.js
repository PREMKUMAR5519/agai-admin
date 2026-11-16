import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { connectDatabase } from '../src/db.js'
import { root } from '../src/config.js'
import { hashPassword } from '../src/security.js'
import { articleSchema, contentSchema } from '../src/schema.js'

const { client, db } = await connectDatabase()
try {
  if (!(await db.collection('users').findOne())) {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required to initialize a new administrator')
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase()
    const password = process.env.ADMIN_PASSWORD
    if (password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters')
    await db.collection('users').insertOne({ email, name: 'AGAI Admin', passwordHash: await hashPassword(password), authVersion: 1, createdAt: new Date() })
    console.log('Administrator created in MongoDB. Only the password hash is stored.')
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
