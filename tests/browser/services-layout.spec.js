import { test, expect } from '@playwright/test'

async function openServices(page) {
  await page.goto('/')
  await page.getByLabel('Email address').fill('editor@example.com')
  await page.getByLabel('Password', { exact: true }).fill('Browser-test-password-2026!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Website content', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your services.' })).toBeVisible()
}

test('services editor keeps the library beside a wide form on desktop', async ({ page }) => {
  await openServices(page)
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(page.locator('.services-library-toggle')).toBeHidden()
    const library = await page.getByRole('complementary', { name: 'Service library' }).boundingBox()
    const editor = await page.locator('.services-editor').boundingBox()
    expect(editor.x).toBeGreaterThan(library.x + library.width)
    expect(Math.abs(editor.y - library.y)).toBeLessThan(2)
    expect(editor.width).toBeGreaterThan(430)
    expect(library.width).toBeLessThan(320)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/services-layout-${width}.png`, fullPage: true })
  }
})

test('services editor fits small screens and returns focus after choosing a service', async ({ page }) => {
  await openServices(page)
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    const toggle = page.locator('.services-library-toggle')
    const library = page.getByRole('complementary', { name: 'Service library' })
    await expect(toggle).toBeVisible()
    await expect(library).toBeHidden()
    await toggle.click()
    await expect(library).toBeVisible()
    await library.getByRole('button', { name: /^Edit / }).nth(1).click()
    await expect(library).toBeHidden()
    await expect(page.locator('.services-editor-heading')).toBeFocused()
    for (const name of ['Overview', 'Details', 'Images', 'Preview']) {
      await page.getByRole('tab', { name, exact: true }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.getByRole('tab', { name: 'Overview', exact: true }).click()
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: `test-results/services-layout-${width}.png`, fullPage: true })
  }
})

test('failed saves preserve edits and failed publishing retries the saved draft without another write', async ({ page }) => {
  await openServices(page)
  const original = await (await page.request.get('/api/services')).json()
  const title = page.getByLabel('Service title', { exact: true })
  const nextTitle = 'Care with a reliable publishing flow'
  await title.fill(`  ${nextTitle}  `)
  let writes = 0
  let publishes = 0
  await page.route('**/api/services', route => {
    if (route.request().method() !== 'PUT') return route.continue()
    writes++
    return writes === 1 ? route.fulfill({ status: 503, json: { message: 'Saving is temporarily unavailable.' } }) : route.continue()
  })
  await page.route('**/api/services/publish', route => {
    publishes++
    return publishes === 1 ? route.fulfill({ status: 503, json: { message: 'Publishing is temporarily unavailable.' } }) : route.continue()
  })
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Saving is temporarily unavailable')
  await expect(title).toHaveValue(`  ${nextTitle}  `)
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Publish changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Your draft is saved, but publishing failed')
  await expect(title).toHaveValue(nextTitle)
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled()
  const saved = await (await page.request.get('/api/services')).json()
  expect(saved.draft.services[0].title).toBe(nextTitle)
  expect(saved.published.services).toEqual(original.published.services)
  expect(saved.revision).toBe(original.revision + 1)
  await page.getByRole('button', { name: 'Publish changes', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Website content published')
  expect(writes).toBe(2) // The failed save and the successful save; no redundant save on retry.
  expect(publishes).toBe(2)
  const published = await (await page.request.get('/api/services')).json()
  expect(published.revision).toBe(saved.revision)
  expect(published.published.services[0].title).toBe(nextTitle)
})

test('image validation opens the right service and field while retaining other edits', async ({ page }) => {
  await openServices(page)
  const original = (await (await page.request.get('/api/services')).json()).draft.services
  await page.getByRole('button', { name: 'Next: Details', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Details', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Next: Images', exact: true }).click()
  await page.locator('#service-image-url').fill('not-an-image-url')
  await page.getByRole('navigation', { name: 'Choose a service' }).getByRole('button').nth(1).click()
  await page.getByRole('tab', { name: 'Overview', exact: true }).click()
  await page.getByLabel('Service title', { exact: true }).fill('Keep this second service edit')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.locator('.services-editor-heading h2')).toHaveText(original[0].shortTitle)
  await expect(page.getByRole('tab', { name: 'Images', exact: true })).toHaveAttribute('aria-selected', 'true')
  const invalid = page.locator('#service-image-url')
  await expect(invalid).toBeFocused()
  await expect(invalid).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#service-image-url-error')).toContainText('complete http:// or https:// image URL')
  const fieldBox = await invalid.boundingBox()
  const savebarBox = await page.locator('.services-savebar').boundingBox()
  expect(fieldBox.y).toBeGreaterThan(savebarBox.y + savebarBox.height)
  await invalid.fill(original[0].image)
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Draft saved')
  const saved = (await (await page.request.get('/api/services')).json()).draft.services
  expect(saved[0].image).toBe(original[0].image)
  expect(saved[1].title).toBe('Keep this second service edit')
})
