import { createHash } from 'node:crypto'

// Atomic, shared counters survive cold starts and work across function instances.
export function loginLimit(db) {
  return async (req, res, next) => {
    const windowMs = 15 * 60 * 1000
    const window = Math.floor(Date.now() / windowMs)
    const address = createHash('sha256').update(req.ip || 'unknown').digest('hex')
    const expiresAt = new Date((window + 1) * windowMs)
    const collection = db.collection('loginLimits')
    const filter = { _id: `${address}:${window}` }
    const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt } }
    let result
    try {
      result = await collection.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' })
    } catch (error) {
      if (error.code !== 11000) throw error
      result = await collection.findOneAndUpdate(filter, update, { returnDocument: 'after' })
    }
    if (result.count > 20) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)))
      return res.status(429).json({ message: 'Too many sign-in attempts. Try again in 15 minutes.' })
    }
    next()
  }
}
