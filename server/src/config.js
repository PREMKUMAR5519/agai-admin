import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

export const root = fileURLToPath(new URL('../', import.meta.url))
export const clientRoot = resolve(root, '../client')
const production = process.env.NODE_ENV === 'production'
let secret = process.env.SESSION_SECRET
if (!secret) {
  if (production) throw new Error('SESSION_SECRET is required in production')
  mkdirSync(resolve(root, '.local'), { recursive: true })
  const path = resolve(root, '.local/session-secret')
  if (!existsSync(path)) writeFileSync(path, randomBytes(48).toString('hex'), { mode: 0o600 })
  secret = readFileSync(path, 'utf8').trim()
}
if (secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters')
export const config = {
  production, secret,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  dbName: process.env.MONGODB_DB || 'agai_cms',
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 5001),
  adminOrigin: process.env.ADMIN_ORIGIN || 'http://localhost:5177',
  publicUrl: (process.env.PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, ''),
  websiteUrl: process.env.WEBSITE_URL || 'https://agaiphysiotherapy.com',
  uploads: resolve(root, 'uploads'),
}
