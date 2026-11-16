import assert from 'node:assert/strict'
const origin = new URL(process.env.DEPLOYMENT_URL)
assert.equal(origin.protocol, 'https:')
const headers = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}
async function get(path) {
  const response = await fetch(new URL(path, origin), { headers, signal: AbortSignal.timeout(20000) })
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`)
  return response
}
assert.equal((await (await get('/api/health')).json()).database, 'connected')
assert.equal((await (await get('/api/public/content')).json()).schemaVersion, 1)
assert.match(await (await get('/journal')).text(), /<div id="root">/)
assert.match((await get('/website-assets/images/home-hero-main.webp')).headers.get('content-type'), /image/)
const denied = await fetch(new URL('/api/posts', origin), { headers })
assert.equal(denied.status, 401)
console.log('Frontend routing, seed images, database, published content, and private API checks passed.')
