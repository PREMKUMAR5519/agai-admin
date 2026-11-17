// Application quota for optimized uploaded images, independent of database overhead.
export const IMAGE_STORAGE_LIMIT = 300 * 1024 * 1024
const quotaId = 'uploaded-images'

async function ensureQuota(db) {
  const quotas = db.collection('storageQuotas')
  const existing = await quotas.findOne({ _id: quotaId })
  if (existing) return existing
  // Existing libraries count towards the allowance on the first deployment.
  const [usage] = await db.collection('media').aggregate([
    { $group: { _id: null, usedBytes: { $sum: '$size' } } },
  ]).toArray()
  try { await quotas.insertOne({ _id: quotaId, usedBytes: usage?.usedBytes || 0 }) }
  catch (error) { if (error.code !== 11000) throw error }
  return quotas.findOne({ _id: quotaId })
}

export async function mediaStorage(db) {
  const [quota, imageCount] = await Promise.all([ensureQuota(db), db.collection('media').countDocuments()])
  return {
    usedBytes: quota.usedBytes,
    limitBytes: IMAGE_STORAGE_LIMIT,
    remainingBytes: Math.max(0, IMAGE_STORAGE_LIMIT - quota.usedBytes),
    imageCount,
  }
}

export async function reserveImageStorage(db, bytes) {
  await ensureQuota(db)
  // One atomic update prevents simultaneous uploads from exceeding the limit.
  const reserved = await db.collection('storageQuotas').findOneAndUpdate(
    { _id: quotaId, usedBytes: { $lte: IMAGE_STORAGE_LIMIT - bytes } },
    { $inc: { usedBytes: bytes } },
    { returnDocument: 'after' },
  )
  if (!reserved) throw Object.assign(new Error('This image exceeds the remaining space in your 300 MB image library. Delete unused images or upload a smaller image.'), { status: 409 })
}

export async function releaseImageStorage(db, bytes) {
  await db.collection('storageQuotas').updateOne({ _id: quotaId }, { $inc: { usedBytes: -bytes } })
}
