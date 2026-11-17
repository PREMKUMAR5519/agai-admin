import { api } from './api'

export async function prepareImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPG, PNG or WebP image.')
  }
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image up to 20 MB.')
  const url = URL.createObjectURL(file)
  const image = new Image()
  const canvas = document.createElement('canvas')
  try {
    image.src = url
    try { await image.decode() } catch { throw new Error('This image could not be opened. Choose a valid JPG, PNG or WebP file.') }
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 40000000) {
      throw new Error('Choose an image with no more than 40 megapixels.')
    }
    let edge = Math.min(1600, Math.max(image.naturalWidth, image.naturalHeight))
    for (let attempt = 0; attempt < 8; attempt++) {
      const scale = edge / Math.max(image.naturalWidth, image.naturalHeight)
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Image processing is unavailable in this browser.')
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      // Some browsers return PNG when WebP encoding is unavailable. Preserve
      // transparency and let the server perform the final WebP conversion.
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.92))
      if (!blob || !['image/webp', 'image/png'].includes(blob.type)) throw new Error('Could not optimize this image. Try another browser.')
      if (blob.size <= 2 * 1024 * 1024) return blob
      edge = Math.max(1, Math.floor(edge * 0.8))
    }
    throw new Error('Could not reduce this image enough. Choose a smaller image.')
  } finally {
    URL.revokeObjectURL(url)
    image.src = ''
    canvas.width = canvas.height = 1
  }
}

export async function uploadImage(file) {
  const optimized = await prepareImage(file)
  const body = new FormData()
  // Retain the original name for the media library; storage uses a .webp UUID.
  body.append('image', optimized, file.name)
  return api('/media', { method: 'POST', body })
}
