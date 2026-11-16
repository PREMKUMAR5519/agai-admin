import { connectDatabase } from './db.js'
import { config } from './config.js'
import { createApp } from './app.js'

try {
  const { client, db } = await connectDatabase()
  const app = createApp({ client, db })
  const server = app.listen(config.port, config.host, () => console.log(`AGAI API ready at http://${config.host}:${config.port}`))
  const close = () => server.close(async () => { await client.close(); process.exit(0) })
  process.on('SIGINT', close)
  process.on('SIGTERM', close)
} catch (error) {
  console.error('Could not start AGAI API. Check MongoDB and .env:', error.message)
  process.exit(1)
}
