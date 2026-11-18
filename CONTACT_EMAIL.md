# Contact enquiry notifications

Each new website contact enquiry is saved in MongoDB first, then the server attempts a notification through Gmail SMTP over TLS. The sender and recipient are both **agaiphysiorehab@gmail.com**. The email includes the contact details, selected service, message, IST timestamp, reference and a link to the authenticated admin inbox. A supplied visitor email becomes Reply-To only. No automatic email is sent to the visitor.

## Configuration

Set `GMAIL_APP_PASSWORD` in the **admin backend**, never in the public website or a `VITE_*` variable. Use the Gmail app password belonging to agaiphysiorehab@gmail.com. Spaces in the app password are ignored. `GMAIL_APP_NAME` is a Google account label and is not needed for SMTP authentication.

For local use, add the password to `server/.env` (ignored by Git), then restart `npm run dev:server` or `npm start`. Keep the existing database and session settings. Do not replace the environment file with the example.

For production, add `GMAIL_APP_PASSWORD` as a sensitive Production environment variable in the **agai-admin Vercel project**, check that `ADMIN_ORIGIN` is the correct public admin URL, and deploy the updated admin project. Local `.env` values are not automatically copied to Vercel. Leave Preview environments without the password unless intentional notifications from previews are wanted. No frontend change or new public credential is required.

To send one explicit setup test without adding an enquiry to the database:

```powershell
npm run check:mail --workspace server
```

The script reports only acceptance or a safe error category. It never prints credentials or Gmail's raw response. Check the clinic mailbox and spam folder after a successful test. SMTP acceptance does not prove that a message reached the inbox.

## Failure handling and retries

- The contact API still returns success when the enquiry was saved but the email failed. The admin inbox remains the source of truth.
- New enquiries store a notification status. Open an enquiry in **Contact forms** to see its status and retry an unsuccessful notification. Missing mail configuration also shows a banner.
- Failed attempts have a one-minute cooldown. Requests with the same submission ID can retry after that cooldown. There is no scheduled background retry job; staff can use the retry button if an attempt fails.
- Atomic database claims prevent ordinary concurrent submissions and retries from sending duplicate notifications. A claim expires after 90 seconds if the server stops. Each SMTP attempt is bounded to eight seconds and awaited before the HTTP response, including on Vercel.
- A stable Message-ID helps correlate retries, but SMTP cannot guarantee exactly-once delivery. A timeout after Gmail accepts mail, or a crash before the sent status is saved, can result in a duplicate on retry. Do not treat a notification as an appointment confirmation.
- Earlier enquiries without notification metadata are not emailed retroactively.
- Only status, attempt counts, timestamps and safe error categories appear in admin responses. Passwords, SMTP responses and form text are not written to mail error logs.

## Checks

`npm test` covers message escaping and Tamil text, correct sender/recipient, TLS, timeouts, validation failures, saved enquiry success during mail failures, retry authentication/CSRF, cooldowns, concurrent submissions and stale claim recovery. Tests use fake mail delivery and isolated test databases.

References: [Google app passwords](https://support.google.com/accounts/answer/185833), [Nodemailer SMTP](https://nodemailer.com/smtp), [message configuration](https://nodemailer.com/message).
