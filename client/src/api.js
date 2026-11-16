let token = ''
export function setToken(value) { token = value }
export async function api(path, options = {}) {
  const multipart = options.body instanceof FormData
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options,
    headers: { ...(!multipart && options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-CSRF-Token': token } : {}), ...options.headers },
    body: options.body ? (multipart ? options.body : JSON.stringify(options.body)) : undefined,
  })
  const data = await response.json().catch(() => ({ message: 'The server returned an unexpected response' }))
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/me') window.dispatchEvent(new Event('session-expired'))
    throw new Error(data.message || 'Request failed')
  }
  if (data.csrf) setToken(data.csrf)
  return data
}
export const assetUrl = value => value?.startsWith('/images/') ? `/website-assets${value}` : value
export const dateLabel = value => value ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Not published'
export const postStatus = post => post.archived ? 'Archived' : !post.published ? 'Draft' : post.revision !== post.publishedRevision ? 'Unpublished changes' : 'Published'
