import sharp from 'sharp'

export async function optimizeImage(buffer) {
  const source = sharp(buffer, { limitInputPixels: 40000000 })
  const metadata = await source.metadata()
  if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Unsupported image format')
  // Keep aspect ratio, transparency, and EXIF orientation. Strip metadata and
  // reduce dimensions for unusually detailed images rather than extreme loss.
  let edge = Math.min(1920, Math.max(metadata.width, metadata.height))
  for (let attempt = 0; attempt < 8; attempt++) {
    const output = await source.clone().rotate()
      .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer({ resolveWithObject: true })
    if (output.data.length <= 512 * 1024) return output
    edge = Math.max(1, Math.floor(edge * 0.8))
  }
  throw new Error('Image could not be optimized within the storage limit')
}
