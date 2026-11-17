import { config } from './config.js'

const fail = (status, message) => Object.assign(new Error(message), { status })
export function loginChallengeConfig() {
  const required = config.production || Boolean(config.turnstileSiteKey || config.turnstileSecretKey)
  if (required && (!config.turnstileSiteKey || !config.turnstileSecretKey)) {
    throw fail(503, 'Login verification is not configured. Please contact the administrator.')
  }
  return { required, siteKey: required ? config.turnstileSiteKey : '' }
}

export async function verifyLoginChallenge(token, fetcher = globalThis.fetch) {
  if (!loginChallengeConfig().required) return
  if (!token) throw fail(400, 'Complete the security verification before signing in.')
  let result
  try {
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: config.turnstileSecretKey, response: token }),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error('Verification unavailable')
    result = await response.json()
  } catch {
    throw fail(503, 'Security verification is temporarily unavailable. Please try again.')
  }
  const hosts = new Set([config.adminOrigin, config.publicUrl,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  ].filter(Boolean).map(origin => { try { return new URL(origin).hostname } catch { return '' } }).filter(Boolean))
  if (!config.production) { hosts.add('localhost'); hosts.add('127.0.0.1') }
  if (result?.success !== true || result.action !== 'admin-login' || !hosts.has(result.hostname)) {
    throw fail(403, 'Security verification failed or expired. Please verify again.')
  }
}
