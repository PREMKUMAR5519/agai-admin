import { articleBody, validateDocument } from '../../shared/rich-text.js'

// Validate draft data rather than relying on inputs that may be hidden in Preview.
export function validateBlogDraft(draft) {
  for (const [field, label, max] of [
    ['title', 'article title', 180], ['excerpt', 'short introduction', 400],
    ['category', 'category', 80], ['slug', 'URL slug', 160],
  ]) {
    if (!draft[field].trim()) return { field, message: `Enter ${field === 'title' ? 'an' : 'a'} ${label}.` }
    if (draft[field].trim().length > max) return { field, message: `Keep the ${label} within ${max} characters.` }
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug.trim())) return { field: 'slug', message: 'Use lowercase words separated by hyphens for the URL slug.' }
  const image = draft.image.trim()
  if (image.length > 2000 || (image && !(/^https?:\/\/[^\s]+$/i.test(image) || /^\/(?:images|uploads)\/[\w./-]+$/.test(image)))) {
    return { field: 'image', message: 'Choose an image from the library or enter a complete http:// or https:// image URL.' }
  }
  if (draft.imageAlt.trim().length > 200) return { field: 'imageAlt', message: 'Keep the image description within 200 characters.' }
  try { validateDocument(articleBody(draft)) }
  catch (error) { return { field: 'body', message: error.message } }
  return null
}
