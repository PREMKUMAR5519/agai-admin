import { test, expect } from '@playwright/test'

const widgetScript = `
window.turnstile = {
  render(container, options) {
    window.testTurnstileOptions = options;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Complete test verification';
    button.onclick = () => options.callback('browser-test-token');
    container.appendChild(button);
    window.testTurnstileContainer = container;
    return 'test-widget';
  },
  remove() { window.testTurnstileContainer?.replaceChildren(); }
};`

test('Turnstile gates login, expires safely and refreshes after a rejected login', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/auth/config', route => route.fulfill({ json: { required: true, siteKey: 'test-site-key' } }))
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', route => route.fulfill({ contentType: 'application/javascript', body: widgetScript }))
  let attempts = 0
  await page.route('**/api/auth/login', async route => {
    expect(route.request().postDataJSON().turnstileToken).toBe('browser-test-token')
    attempts++
    if (attempts === 1) return route.fulfill({ status: 401, json: { message: 'Email or password is incorrect' } })
    return route.continue()
  })
  await page.goto('/')
  await page.getByLabel('Email address').fill('editor@example.com')
  await page.getByLabel('Password', { exact: true }).fill('Browser-test-password-2026!')
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(signIn).toBeDisabled()
  await page.getByRole('button', { name: 'Complete test verification' }).click()
  await expect(signIn).toBeEnabled()
  expect(await page.evaluate(() => window.testTurnstileOptions.action)).toBe('admin-login')
  await page.evaluate(() => window.testTurnstileOptions['expired-callback']())
  await expect(signIn).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('Verification expired')
  await page.getByRole('button', { name: 'Retry verification', exact: true }).click()
  await page.getByRole('button', { name: 'Complete test verification' }).click()
  await signIn.click()
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect')
  await expect(signIn).toBeDisabled()
  await page.getByRole('button', { name: 'Complete test verification' }).click()
  await signIn.click()
  await expect(page.getByRole('heading', { name: 'Welcome to your CMS.' })).toBeVisible()
  expect(attempts).toBe(2)
  expect(errors).toEqual([])
})

test('login stays blocked when configuration or the widget script cannot load', async ({ page }) => {
  // Start compact so ResizeObserver does not automatically remount/retry the
  // widget while this test changes the script response from failure to success.
  await page.setViewportSize({ width: 320, height: 740 })
  let configFails = true
  let scriptFails = true
  await page.route('**/api/auth/config', route => configFails
    ? route.fulfill({ status: 503, json: { message: 'Login verification is not configured.' } })
    : route.fulfill({ json: { required: true, siteKey: 'test-site-key' } }))
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', route => scriptFails
    ? route.abort('failed')
    : route.fulfill({ contentType: 'application/javascript', body: widgetScript }))
  await page.goto('/')
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(page.getByRole('alert')).toContainText('not configured')
  await expect(signIn).toBeDisabled()
  configFails = false
  await page.getByRole('button', { name: 'Retry login verification' }).click()
  await expect(page.getByRole('alert')).toContainText('could not load')
  await expect(signIn).toBeDisabled()
  scriptFails = false
  await page.getByRole('button', { name: 'Retry verification', exact: true }).click()
  await page.getByRole('button', { name: 'Complete test verification' }).click()
  await expect(signIn).toBeEnabled()
  await page.evaluate(() => window.testTurnstileOptions['error-callback']('test-error'))
  await expect(signIn).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('Security verification failed')
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect.poll(() => page.evaluate(() => window.testTurnstileOptions.size)).toBe('flexible')
  await page.setViewportSize({ width: 320, height: 740 })
  await expect.poll(() => page.evaluate(() => window.testTurnstileOptions.size)).toBe('compact')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
