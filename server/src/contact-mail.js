import nodemailer from 'nodemailer'

export const CONTACT_MAILBOX = 'agaiphysiorehab@gmail.com'
const MAIL_TIMEOUT_MS = 8000
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

export function contactMessage(enquiry, adminUrl) {
  const received = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(enquiry.createdAt))
  const inbox = new URL('/contact-forms', adminUrl).href
  const rows = [['Name', enquiry.name], ['Phone', enquiry.phone], ['Email', enquiry.email || 'Not provided'], ['Service', enquiry.service], ['Received (IST)', received], ['Reference', enquiry._id]]
  return {
    from: { name: 'AGAI Website', address: CONTACT_MAILBOX },
    to: CONTACT_MAILBOX,
    // Do not automatically email the visitor or use their address as the sender.
    ...(enquiry.email ? { replyTo: { address: enquiry.email } } : {}),
    subject: `New website enquiry · ${enquiry._id}`,
    messageId: `<contact-${enquiry._id}@agaiphysiotherapy.com>`,
    text: `A new contact enquiry was received on the AGAI website.\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\nMessage:\n${enquiry.message}\n\nOpen the admin inbox: ${inbox}\n\nThis is an enquiry notification, not a confirmed appointment.`,
    html: `<div style="font-family:Arial,sans-serif;color:#143b63;line-height:1.6;max-width:620px"><h1 style="font-size:24px;color:#0558ad">New website enquiry</h1><p>A visitor has sent an enquiry to AGAI Physiotherapy Centre.</p><table style="border-collapse:collapse">${rows.map(([label, value]) => `<tr><th style="text-align:left;vertical-align:top;padding:6px 20px 6px 0">${label}</th><td style="padding:6px 0;overflow-wrap:anywhere">${escapeHtml(value)}</td></tr>`).join('')}</table><h2 style="font-size:18px">Message</h2><p style="white-space:pre-wrap">${escapeHtml(enquiry.message)}</p><p><a href="${escapeHtml(inbox)}">Open the admin inbox</a></p><p style="font-size:12px;color:#526b82">This is an enquiry notification, not a confirmed appointment.</p></div>`,
    disableFileAccess: true,
    disableUrlAccess: true,
  }
}

export function createContactMailer({ appPassword = '', adminUrl, createTransport = nodemailer.createTransport, timeoutMs = MAIL_TIMEOUT_MS }) {
  const password = appPassword.replace(/\s/g, '')
  return {
    configured: Boolean(password),
    async send(enquiry) {
      if (!password) throw Object.assign(new Error('Mail is not configured'), { code: 'NOT_CONFIGURED' })
      const transport = createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true,
        auth: { user: CONTACT_MAILBOX, pass: password },
        connectionTimeout: 4000, greetingTimeout: 3000, socketTimeout: 6000,
        logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
      })
      let timeout
      try {
        const result = await Promise.race([
          transport.sendMail(contactMessage(enquiry, adminUrl)),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(Object.assign(new Error('Mail attempt timed out'), { code: 'ETIMEDOUT' })), timeoutMs) }),
        ])
        if (!result.accepted?.some(address => address.toLowerCase() === CONTACT_MAILBOX)) throw Object.assign(new Error('Notification was not accepted'), { code: 'EENVELOPE' })
        return { messageId: result.messageId }
      } finally {
        clearTimeout(timeout)
        transport.close()
      }
    },
  }
}
