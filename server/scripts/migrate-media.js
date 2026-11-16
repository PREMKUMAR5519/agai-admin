import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { connectDatabase } from '../src/db.js'
import { config } from '../src/config.js'

// Run against the restored destination database, with the old upload directory available.
const { db, client } = await connectDatabase()
try {
  for await (const media of db.collection('media').find()) {
    if (!/^[\w-]+\.webp$/.test(media.filename)) throw new Error('Invalid media filename')
    if (await db.collection('mediaFiles').findOne({ _id: media.filename }, { projection: { _id: 1 } })) continue
    const data = await readFile(resolve(config.uploads, media.filename))
    if (data.length > 3 * 1024 * 1024) throw new Error(`Resize ${media.filename} below 3 MB before migration`)
    await db.collection('mediaFiles').insertOne({ _id: media.filename, data })
    console.log(`Migrated ${media.filename}`)
  }
} finally { await client.close() }
