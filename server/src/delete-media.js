import { unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { mediaStorage, releaseImageStorage } from './media-storage.js'

// Works on both local standalone MongoDB and Atlas, without a background worker.
export async function deleteMedia(db, mediaId, { uploads, vercel }) {
  // Initialize the quota before removing a pre-quota library record.
  await mediaStorage(db)
  const media = await db.collection('media').findOne({ _id: mediaId })
  if (!media) throw Object.assign(new Error('Image not found. It may already have been deleted.'), { status: 404 })
  const localPath = resolve(uploads, media.filename || '')
  if (!/^[\w-]+\.(?:webp|png|jpe?g)$/i.test(media.filename || '') || dirname(localPath) !== resolve(uploads)) {
    throw Object.assign(new Error('This image has an invalid storage filename and could not be deleted.'), { status: 400 })
  }
  // Claim the record atomically: simultaneous requests must not release its bytes twice.
  const removed = await db.collection('media').findOneAndDelete({ _id: mediaId })
  if (!removed) throw Object.assign(new Error('Image not found. It may already have been deleted.'), { status: 404 })
  try {
    await db.collection('mediaFiles').deleteOne({ _id: removed.filename })
    if (!vercel) {
      try { await unlink(localPath) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    await releaseImageStorage(db, removed.size || 0)
  } catch (error) {
    // Keep a retryable record and its quota if file cleanup or quota release fails.
    // Already-removed files are safe to delete again on the next attempt.
    await db.collection('media').insertOne(removed)
    throw Object.assign(new Error('Image deletion could not finish. Please try deleting it again.', { cause: error }), { status: 503 })
  }
  return removed
}
