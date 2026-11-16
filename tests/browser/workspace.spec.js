import { test, expect } from '@playwright/test'
import sharp from 'sharp'
import { randomBytes } from 'node:crypto'

async function login(page) {
  await page.goto('/')
  await page.getByLabel('Email address').fill('editor@example.com')
  await page.getByLabel('Password', { exact: true }).fill('Browser-test-password-2026!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome to your CMS.' })).toBeVisible()
}
test('journal draft, preview, publish, edit, and archive connect to the public website', async ({ page, context }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await login(page)
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.screenshot({ path: 'test-results/studio-desktop.png', fullPage: true })
  await page.getByRole('link', { name: 'New article', exact: true }).click()
  await page.getByLabel('Article title', { exact: true }).fill('A thoughtful new chapter')
  await page.getByLabel('Short introduction').fill('Practical support for a clearer conversation about your movement goals.')
  await page.getByLabel('Section 1 heading').fill('Start with a conversation')
  await page.getByLabel('Section 1 text').fill('Bring your questions and discuss what matters most to you with your physiotherapist.')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page).toHaveURL(/\/journal\/[a-f\d]{24}$/)
  const publicPage = await context.newPage()
  await publicPage.goto('http://127.0.0.1:5190/blogs/a-thoughtful-new-chapter')
  await expect(publicPage.getByRole('heading', { name: 'Article not found.' })).toBeVisible()
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(page.locator('.article-preview h1')).toHaveText('A thoughtful new chapter')
  await page.getByRole('button', { name: 'Back to editor', exact: true }).click()
  await page.getByRole('button', { name: 'Publish article', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Article published')
  await publicPage.reload()
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText('A thoughtful new chapter')
  await page.getByLabel('Article title', { exact: true }).fill('A revised thoughtful chapter')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Draft saved')
  await publicPage.reload()
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText('A thoughtful new chapter')
  await page.getByRole('button', { name: 'Publish article', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Article published')
  await publicPage.reload()
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText('A revised thoughtful chapter')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Archive article', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Article archived')
  await publicPage.reload()
  await expect(publicPage.getByRole('heading', { name: 'Article not found.' })).toBeVisible()
  await page.getByRole('button', { name: 'Restore to drafts', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Restored as a draft')
  expect(errors).toEqual([])
})
test('service editing preserves draft privacy and publishes content', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Website content', exact: true }).click()
  const original = await (await page.request.get('/api/public/content')).json()
  await page.getByLabel('Service title', { exact: true }).fill('Personalized physiotherapy care')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Draft saved')
  const beforePublish = await (await page.request.get('/api/public/content')).json()
  expect(beforePublish.content.services[0].title).toBe(original.content.services[0].title)
  await page.getByRole('button', { name: 'Publish changes', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Website content published')
  const published = await (await page.request.get('/api/public/content')).json()
  expect(published.content.services[0].title).toBe('Personalized physiotherapy care')
  expect(published.content.home).toEqual(original.content.home)
  expect(published.content.founder).toEqual(original.content.founder)
})

test('mobile navigation, search, and sign-out work without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.screenshot({ path: 'test-results/studio-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await page.getByRole('link', { name: 'Journal', exact: true }).click()
  await page.getByLabel('Search articles').fill('your first visit')
  await expect(page.locator('.article-row')).toHaveCount(1)
  await page.getByLabel('Search articles').fill('no-match-example')
  await expect(page.getByRole('heading', { name: 'A little room for something new.' })).toBeVisible()
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await page.locator('.account').click()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
})

test('media upload and image picker attach an optimized image to an article', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Media library', exact: true }).click()
  const buffer = await sharp(randomBytes(1600 * 1200 * 3), { raw: { width: 1600, height: 1200, channels: 3 } }).png().toBuffer()
  expect(buffer.length).toBeGreaterThan(4.5 * 1024 * 1024)
  await page.evaluate(() => {
    const fetch = window.fetch.bind(window)
    window.fetch = (url, options) => {
      if (url === '/api/media' && options?.body instanceof FormData) window.uploadedImageBytes = options.body.get('image').size
      return fetch(url, options)
    }
  })
  const uploadResponse = page.waitForResponse(response => response.url().endsWith('/api/media') && response.request().method() === 'POST')
  await page.locator('input[type="file"]').setInputFiles({ name: 'test-cover.png', mimeType: 'image/png', buffer })
  await expect(page.getByRole('status')).toContainText('Image uploaded')
  const uploadedBytes = await page.evaluate(() => window.uploadedImageBytes)
  expect(uploadedBytes).toBeGreaterThan(0)
  expect(uploadedBytes).toBeLessThanOrEqual(2 * 1024 * 1024)
  const saved = await (await uploadResponse).json()
  expect(saved.size).toBeLessThanOrEqual(512 * 1024)
  expect(saved.filename).toMatch(/\.webp$/)
  await expect(page.locator('.media-card img')).toHaveJSProperty('naturalWidth', saved.width)
  await page.getByRole('link', { name: 'Journal', exact: true }).click()
  await page.getByRole('link', { name: 'New article', exact: true }).click()
  await page.getByRole('button', { name: 'Choose or upload image' }).click()
  await page.getByRole('button', { name: 'test-cover.png' }).click()
  await expect(page.getByLabel('Image URL', { exact: true })).toHaveValue(/\/uploads\/[\w-]+\.webp$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: /Change image/ }).click()
  const jpeg = await sharp({ create: { width: 2600, height: 1600, channels: 3, background: '#227755' } }).jpeg().toBuffer()
  const pickerResponse = page.waitForResponse(response => response.url().endsWith('/api/media') && response.request().method() === 'POST')
  await page.getByRole('dialog').locator('input[type="file"]').setInputFiles({ name: 'picker-photo.jpg', mimeType: 'image/jpeg', buffer: jpeg })
  const selected = await (await pickerResponse).json()
  expect(selected.width).toBe(1920)
  expect(selected.size).toBeLessThanOrEqual(512 * 1024)
  await expect(page.getByLabel('Image URL', { exact: true })).toHaveValue(selected.url)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('image preparation handles unsupported WebP encoders and invalid files', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { prepareImage } = await import('/src/image-upload.js')
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 20
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    const original = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function(callback) { return original.call(this, callback, 'image/png') }
    try {
      const output = await prepareImage(new File([png], 'transparent.png', { type: 'image/png' }))
      const messages = []
      for (const file of [new File(['invalid'], 'fake.jpg', { type: 'image/jpeg' }), new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })]) {
        try { await prepareImage(file) } catch (error) { messages.push(error.message) }
      }
      return { type: output.type, size: output.size, messages }
    } finally { HTMLCanvasElement.prototype.toBlob = original }
  })
  expect(result.type).toBe('image/png')
  expect(result.size).toBeLessThan(2 * 1024 * 1024)
  expect(result.messages[0]).toContain('could not be opened')
  expect(result.messages[1]).toContain('20 MB')
})
