import { MongoClient } from 'mongodb'
import { databaseFailureMessage } from '../src/database-diagnostics.js'

// Read-only check: no users, seed data, collections, or indexes are created.
let client
try {
  if (!process.env.MONGODB_URI) {
    console.error('Set MONGODB_URI in server/.env or the process environment before checking the database.')
    process.exitCode = 1
  } else {
    client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, maxPoolSize: 1,
    })
    await client.connect()
    await client.db(process.env.MONGODB_DB || 'agai_cms').command({ ping: 1 })
    console.log('MongoDB connection and ping succeeded from this environment. No content was changed.')
  }
} catch (error) {
  console.error(databaseFailureMessage(error))
  process.exitCode = 1
} finally {
  await client?.close()
}
