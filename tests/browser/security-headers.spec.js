import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import sharp from 'sharp'

const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
const headers = Object.fromEntries(config.headers.find(rule => rule.source === '/(.*)').headers.map(({ key, value }) => [key.toLowerCase(), value]))

// The local Express server is not Vercel's CDN. Apply the exact checked-in CDN
// headers to built HTML responses so the browser enforces the production policy.
test.beforeEach(async ({ page, baseURL }) => {
  test.skip(process.env.E2E_BUILT_CLIENT !== '1', 'Security policy checks require npm run build and E2E_BUILT_CLIENT=1')
  await page.route('**/*', async route => {
    if (route.request().resourceType() !== 'document' || new URL(route.request().url()).origin !== baseURL) return route.fallback()
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), ...headers } })
  })
  await page.addInitScript(() => {
    window.policyViolations = []
    document.addEventListener('securitypolicyviolation', event => window.policyViolations.push({ directive: event.effectiveDirective, uri: event.blockedURI }))
  })
})

test('static policy allows Turnstile, rich-text formatting and image upload', async ({ page }) => {
  await page.route('**/api/auth/config', route => route.fulfill({ json: { required: true, siteKey: 'test-site-key' } }))
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.turnstile = {
      render(container, options) {
        const frame = document.createElement('iframe');
        frame.title = 'Test challenge frame'; frame.src = 'https://challenges.cloudflare.com/test-frame';
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = 'Complete test verification'; button.onclick = () => options.callback('test-token');
        container.append(frame, button); window.widgetContainer = container; return 'widget';
      }, remove() { window.widgetContainer?.replaceChildren(); }
    };` }))
  await page.route('https://challenges.cloudflare.com/test-frame', route => route.fulfill({ contentType: 'text/html', body: '<p>Challenge frame loaded</p>' }))
  const response = await page.goto('/')
  expect(response.headers()['content-security-policy']).toBe(headers['content-security-policy'])
  expect(response.headers()['x-frame-options']).toBe('DENY')
  expect(response.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
  await expect(page.frameLocator('iframe[title="Test challenge frame"]').getByText('Challenge frame loaded')).toBeVisible()
  await page.getByLabel('Email address').fill('editor@example.com')
  await page.getByLabel('Password', { exact: true }).fill('Browser-test-password-2026!')
  await page.getByRole('button', { name: 'Complete test verification' }).click()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'New blog', exact: true }).click()
  await page.getByLabel('Article title', { exact: true }).fill('Publishing under the production security policy')
  await page.getByLabel('Short introduction', { exact: true }).fill('A complete security policy compatibility check.')
  const editor = page.getByRole('textbox', { name: 'Blog content' })
  await editor.click()
  await page.getByRole('button', { name: 'Align center', exact: true }).click()
  await page.getByRole('button', { name: 'Bold', exact: true }).click()
  await page.keyboard.type('Rich formatting still works.')
  await page.getByRole('button', { name: 'Choose or upload image' }).click()
  const buffer = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#227755' } }).png().toBuffer()
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'policy-photo.png', mimeType: 'image/png', buffer })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'Selected image', exact: true })).toHaveJSProperty('naturalWidth', 80)
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(page.locator('.article-preview strong')).toHaveText('Rich formatting still works.')
  await expect(page.locator('.article-preview .rich-text p')).toHaveCSS('text-align', 'center')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page).toHaveURL(/\/journal\/[a-f\d]{24}$/)
  expect(await page.evaluate(() => window.policyViolations)).toEqual([])
})

test('static policy blocks inline and unapproved scripts and embedding the admin', async ({ page, baseURL }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Admin login' })).toBeVisible()
  await page.evaluate(() => {
    const inline = document.createElement('script'); inline.textContent = 'window.untrustedScriptRan = true'; document.head.appendChild(inline)
    const external = document.createElement('script'); external.src = 'https://untrusted.invalid/injected.js'; document.head.appendChild(external)
  })
  await expect.poll(() => page.evaluate(() => window.policyViolations.filter(item => item.directive === 'script-src-elem').length)).toBe(2)
  expect(await page.evaluate(() => window.untrustedScriptRan)).toBeUndefined()
  const blocked = []
  page.on('console', message => { if (message.type() === 'error') blocked.push(message.text()) })
  await page.route('http://127.0.0.1:5178/frame-test', route => route.fulfill({ contentType: 'text/html', body: `<iframe src="${baseURL}/" title="Embedded admin"></iframe>` }))
  await page.goto('http://127.0.0.1:5178/frame-test')
  await expect.poll(() => blocked.some(message => /frame-ancestors|X-Frame-Options/.test(message))).toBe(true)
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Admin login' })).toHaveCount(0)
})
