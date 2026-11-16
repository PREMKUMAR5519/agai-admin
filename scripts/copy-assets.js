import { cpSync } from 'node:fs'
// Serve seed images from Vercel's CDN, without invoking the API.
cpSync(new URL('../server/seed/assets/', import.meta.url), new URL('../client/dist/website-assets/', import.meta.url), { recursive: true })
