import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { connectDatabase } from '../server/src/db.js'
import { config, root } from '../server/src/config.js'

export default async function cleanup() {
  const state = resolve(root, '.local/e2e-state.json')
  if (!existsSync(state)) return
  const { dbName } = JSON.parse(readFileSync(state, 'utf8'))
  if (!/^agai_cms_e2e_\d+$/.test(dbName)) throw new Error('Refusing to clean an unexpected test database')
  const { client, db } = await connectDatabase(dbName)
  try {
    for (const file of await db.collection('media').find().toArray()) {
      if (!/^[a-f\d-]+\.webp$/.test(file.filename)) throw new Error('Unexpected test upload filename')
      const path = resolve(config.uploads, file.filename)
      if (existsSync(path)) unlinkSync(path)
    }
    await db.dropDatabase()
    unlinkSync(state)
  } finally { await client.close() }
}
