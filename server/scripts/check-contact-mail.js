import { randomUUID } from 'node:crypto'
import { config } from '../src/config.js'
import { createContactMailer } from '../src/contact-mail.js'

const mailer = createContactMailer({ appPassword: config.gmailAppPassword, adminUrl: config.adminOrigin })
if (!mailer.configured) {
  console.error('GMAIL_APP_PASSWORD is missing. Set it in server/.env or the server environment.')
  process.exitCode = 1
} else {
  try {
    await mailer.send({ _id: randomUUID(), name: 'AGAI notification setup test', email: '', phone: 'Test only', service: 'Notification setup', createdAt: new Date(), message: 'This is a test of the website contact enquiry notification. It is not a patient enquiry. No appointment is requested. No enquiry was added to the admin database.' })
    console.log('Gmail accepted the test notification for agaiphysiorehab@gmail.com. Check the inbox or spam folder.')
  } catch (error) {
    console.error(`Test email failed (${['EAUTH', 'ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS', 'EENVELOPE'].includes(error.code) ? error.code : 'SEND_FAILED'}). Check the Gmail app password and outbound SMTP connectivity.`)
    process.exitCode = 1
  }
}
