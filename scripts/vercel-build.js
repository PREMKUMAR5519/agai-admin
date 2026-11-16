import { spawnSync } from 'node:child_process'

function run(script) {
  // npm_execpath is supplied by npm; avoids shell interpolation of environment values.
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', script], { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}

run('build')
if (process.env.INITIALIZE_DATABASE === 'true') {
  if (process.env.VERCEL_ENV !== 'production') {
    throw new Error('Database initialization is only allowed in a production Vercel build')
  }
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD for first-time initialization')
  }
  process.env.NODE_ENV = 'production'
  run('setup')
}
