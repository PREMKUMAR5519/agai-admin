import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

export const root = fileURLToPath(new URL('../', import.meta.url))
export const clientRoot = resolve(root, '../client')
const production = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
if (production && !process.env.MONGODB_URI) throw new Error('MONGODB_URI is required in production')
const publicUrl = (process.env.API_URL || process.env.PUBLIC_API_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:5001')).replace(/\/$/, '')
let secret = process.env.SESSION_SECRET
if (!secret) {
  if (production) throw new Error('SESSION_SECRET is required in production')
  // Development sessions expire on restart unless SESSION_SECRET is supplied.
  secret = randomBytes(48).toString('hex')
}
if (secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters')
export const config = {
  production, secret,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  dbName: process.env.MONGODB_DB || 'agai_cms',
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 5001),
  adminOrigin: process.env.ADMIN_ORIGIN || (production ? publicUrl : 'http://localhost:5177'),
  publicUrl,
  vercel: process.env.VERCEL === '1',
  websiteUrl: process.env.WEBSITE_URL || 'https://agaiphysiotherapy.com',
  uploads: resolve(root, 'uploads'),
}
