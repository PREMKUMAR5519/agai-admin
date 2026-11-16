import { MongoClient } from 'mongodb'
import { config } from './config.js'
export async function connectDatabase(name = config.dbName) {
  const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 5, maxIdleTimeMS: 60000 })
  try {
    await client.connect()
    const db = client.db(name)
    await Promise.all([
      db.collection('users').createIndex({ email: 1 }, { unique: true }),
      db.collection('posts').createIndex({ 'draft.slug': 1 }, { unique: true }),
      db.collection('posts').createIndex({ 'published.slug': 1 }, { unique: true, partialFilterExpression: { 'published.slug': { $type: 'string' } } }),
      db.collection('activity').createIndex({ createdAt: -1 }),
      db.collection('loginLimits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ])
    return { client, db }
  } catch (error) {
    await client.close()
    throw error
  }
}
