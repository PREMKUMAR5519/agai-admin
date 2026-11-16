import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { optimizeImage } from '../src/optimize-image.js'

test('large detailed images become bounded WebP files', async () => {
  const original = await sharp(randomBytes(2400 * 1800 * 3), { raw: { width: 2400, height: 1800, channels: 3 } }).png().toBuffer()
  assert.ok(original.length > 4.5 * 1024 * 1024)
  const output = await optimizeImage(original)
  const decoded = await sharp(output.data).metadata()
  assert.equal(decoded.format, 'webp')
  assert.ok(output.data.length <= 512 * 1024)
  assert.ok(decoded.width <= 1920 && decoded.height <= 1920)
  assert.ok(Math.abs(decoded.width / decoded.height - 4 / 3) < 0.01)
})

test('PNG transparency and JPEG orientation survive conversion without metadata', async () => {
  const png = await sharp({ create: { width: 100, height: 80, channels: 4, background: { r: 10, g: 30, b: 50, alpha: 0.5 } } }).png().toBuffer()
  const transparent = await optimizeImage(png)
  const alpha = await sharp(transparent.data).raw().toBuffer({ resolveWithObject: true })
  assert.equal(alpha.info.channels, 4)
  assert.ok(alpha.data[3] >= 126 && alpha.data[3] <= 129)
  const jpeg = await sharp({ create: { width: 100, height: 80, channels: 3, background: '#0756aa' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
  const rotated = await optimizeImage(jpeg)
  const metadata = await sharp(rotated.data).metadata()
  assert.equal(metadata.width, 80)
  assert.equal(metadata.height, 100)
  assert.equal(metadata.exif, undefined)
  assert.equal(metadata.format, 'webp')
})
