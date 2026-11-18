import { randomUUID } from 'node:crypto'

export function notificationSummary(value) {
  if (!value) return { status: 'not_requested' }
  return { status: value.status, attempts: value.attempts || 0, sentAt: value.sentAt, lastAttemptAt: value.lastAttemptAt, errorCode: value.errorCode, retryAfter: value.nextAttemptAt }
}

export function createContactNotifications({ db, mailer, now = () => new Date() }) {
  const collection = db.collection('contactSubmissions')
  return {
    configured: mailer.configured,
    async send(id) {
      const time = now()
      const eligible = { _id: id, $or: [
        { 'emailNotification.status': { $in: ['pending', 'not_configured'] } },
        { 'emailNotification.status': 'failed', 'emailNotification.nextAttemptAt': { $lte: time } },
        { 'emailNotification.status': 'sending', 'emailNotification.lockUntil': { $lte: time } },
      ] }
      if (!mailer.configured) {
        await collection.updateOne(eligible, { $set: { 'emailNotification.status': 'not_configured' } })
        return notificationSummary((await collection.findOne({ _id: id }))?.emailNotification)
      }
      const lock = randomUUID()
      const enquiry = await collection.findOneAndUpdate(eligible, {
        $set: { 'emailNotification.status': 'sending', 'emailNotification.lock': lock, 'emailNotification.lockUntil': new Date(time.getTime() + 90000), 'emailNotification.lastAttemptAt': time },
        $inc: { 'emailNotification.attempts': 1 },
        $unset: { 'emailNotification.errorCode': '', 'emailNotification.nextAttemptAt': '' },
      }, { returnDocument: 'after' })
      // An atomic claim prevents concurrent submissions or admin retries sending twice.
      if (!enquiry) return notificationSummary((await collection.findOne({ _id: id }))?.emailNotification)
      const claim = { _id: id, 'emailNotification.lock': lock }
      let sent
      try { sent = await mailer.send(enquiry) }
      catch (error) {
        const errorCode = ['EAUTH', 'ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS', 'EENVELOPE'].includes(error.code) ? error.code : 'SEND_FAILED'
        // Persist only a safe category, never SMTP responses, credentials or form text.
        await collection.updateOne(claim, { $set: { 'emailNotification.status': 'failed', 'emailNotification.errorCode': errorCode, 'emailNotification.nextAttemptAt': new Date(now().getTime() + 60000) }, $unset: { 'emailNotification.lock': '', 'emailNotification.lockUntil': '' } })
        return notificationSummary((await collection.findOne({ _id: id }))?.emailNotification)
      }
      // A persistence failure here leaves the lease intact; do not immediately resend.
      await collection.updateOne(claim, { $set: { 'emailNotification.status': 'sent', 'emailNotification.sentAt': now(), 'emailNotification.messageId': sent.messageId }, $unset: { 'emailNotification.lock': '', 'emailNotification.lockUntil': '' } })
      return notificationSummary((await collection.findOne({ _id: id }))?.emailNotification)
    },
  }
}
