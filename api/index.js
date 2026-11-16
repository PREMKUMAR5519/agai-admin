// One Express instance and connection pool per warm Vercel function instance.
let application
export default async function handler(req, res) {
  try {
    application ||= Promise.all([
      import('../server/src/db.js'), import('../server/src/app.js'),
    ]).then(async ([{ connectDatabase }, { createApp }]) => {
      const connection = await connectDatabase()
      return createApp(connection)
    }).catch(error => { application = undefined; throw error })
    const app = await application
    return app(req, res)
  } catch {
    console.error('API initialization failed. Check runtime configuration and database connectivity.')
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify({ message: 'Service temporarily unavailable' }))
  }
}
