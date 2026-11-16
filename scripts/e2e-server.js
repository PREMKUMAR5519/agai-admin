import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

process.env.ADMIN_ORIGIN = 'http://127.0.0.1:5178'
process.env.API_URL = 'http://127.0.0.1:5002'
process.env.API_PROXY_TARGET = 'http://127.0.0.1:5002'
const [{ connectDatabase }, { hashPassword }, { createApp }, { root, clientRoot }] = await Promise.all([
  import('../server/src/db.js'), import('../server/src/security.js'), import('../server/src/app.js'), import('../server/src/config.js'),
])
const dbName = `agai_cms_e2e_${process.pid}`
mkdirSync(resolve(root, '.local'), { recursive: true })
writeFileSync(resolve(root, '.local/e2e-state.json'), JSON.stringify({ dbName }))
const { client, db } = await connectDatabase(dbName)
const seed = JSON.parse(readFileSync(resolve(root, 'seed/content.json'), 'utf8'))
await db.collection('users').insertOne({ email: 'editor@example.com', name: 'Test Editor', passwordHash: await hashPassword('Browser-test-password-2026!'), authVersion: 1 })
await db.collection('content').insertOne({ _id: 'main', draft: seed.content, published: seed.content, revision: 0, publishedRevision: 0, publishedAt: new Date() })
await db.collection('posts').insertMany(seed.articles.map(draft => ({ draft, published: draft, revision: 0, publishedRevision: 0, archived: false, createdAt: new Date(), updatedAt: new Date(), publishedAt: new Date() })))
const server = createApp({ client, db }).listen(5002, '127.0.0.1')
const web = await createServer({ root: clientRoot, server: { host: '127.0.0.1', port: 5178, strictPort: true } })
await web.listen()
const websiteRoot = resolve(root, '../../agai')
const website = await createServer({ root: websiteRoot, configFile: resolve(websiteRoot, 'vite.config.ts'), define: { 'import.meta.env.VITE_CMS_API_URL': JSON.stringify('http://127.0.0.1:5002') }, server: { host: '127.0.0.1', port: 5190, strictPort: true } })
await website.listen()
console.log('Isolated browser test servers ready')
async function close() {
  await Promise.all([web.close(), website.close()])
  server.close()
  if (dbName.startsWith('agai_cms_e2e_')) await db.dropDatabase()
  await client.close()
  process.exit(0)
}
process.on('SIGINT', close)
process.on('SIGTERM', close)
