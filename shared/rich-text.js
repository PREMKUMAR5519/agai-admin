export function documentText(node) {
  if (node.type === 'text') return node.text || ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content || []).map(documentText).join(['doc', 'bulletList', 'orderedList', 'listItem', 'blockquote'].includes(node.type) ? '\n' : '')
}

export function articleBody(article) {
  return article.body || { type: 'doc', content: (article.sections || []).flatMap(section => [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: section.heading }] },
    ...section.text.split('\n').map(text => ({ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) })),
  ]) }
}

// Compatibility text for older consumers of the published content API.
export function documentSections(body) {
  const text = documentText(body).trim()
  const sections = []
  for (let offset = 0; offset < text.length; offset += 15000) {
    sections.push({ heading: sections.length ? 'Continued' : 'Article', text: text.slice(offset, offset + 15000) })
  }
  return sections
}

export function safeLink(href) {
  if (typeof href !== 'string' || href.length > 2000 || /[\s\u0000-\u001f]/.test(href)) return false
  try { return ['https:', 'http:', 'mailto:'].includes(new URL(href).protocol) } catch { return false }
}

// Rebuild an allowlisted tree. No HTML, CSS strings, or arbitrary attributes are stored.
export function validateDocument(value) {
  if (!value || value.type !== 'doc') throw new Error('Enter the blog body')
  let count = 0, characters = 0
  const blocks = ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'horizontalRule']
  function visit(node, depth = 0) {
    if (++count > 5000 || depth > 12) throw new Error('Blog formatting is too complex')
    if (!node || typeof node !== 'object') throw new Error('Invalid blog content')
    const { type } = node
    if (type === 'text') {
      if (typeof node.text !== 'string' || !node.text.length) throw new Error('Invalid blog text')
      characters += node.text.length
      if (characters > 100000) throw new Error('Blog body must be under 100,000 characters')
      const marks = (node.marks || []).map(mark => {
        if (['bold', 'italic', 'underline', 'strike'].includes(mark.type)) return { type: mark.type }
        if (mark.type === 'link' && safeLink(mark.attrs?.href)) return { type: 'link', attrs: { href: mark.attrs.href, target: '_blank', rel: 'noopener noreferrer' } }
        throw new Error('Unsupported text formatting or unsafe link')
      })
      return { type, text: node.text, ...(marks.length ? { marks } : {}) }
    }
    if (['hardBreak', 'horizontalRule'].includes(type)) return { type }
    if (!['doc', 'listItem', ...blocks].includes(type)) throw new Error('Unsupported blog formatting')
    const attrs = {}
    if (type === 'heading') {
      if (![2, 3, 4].includes(node.attrs?.level)) throw new Error('Unsupported heading level')
      attrs.level = node.attrs.level
    }
    if (['heading', 'paragraph'].includes(type) && node.attrs?.textAlign != null) {
      if (!['left', 'center', 'right', 'justify'].includes(node.attrs.textAlign)) throw new Error('Invalid text alignment')
      attrs.textAlign = node.attrs.textAlign
    }
    if (type === 'orderedList') {
      const start = node.attrs?.start ?? 1
      if (!Number.isInteger(start) || start < 1 || start > 10000) throw new Error('Invalid list numbering')
      attrs.start = start
    }
    if (node.content !== undefined && !Array.isArray(node.content)) throw new Error('Invalid blog content')
    const content = (node.content || []).map(child => visit(child, depth + 1))
    const allowed = ['paragraph', 'heading'].includes(type) ? ['text', 'hardBreak']
      : ['bulletList', 'orderedList'].includes(type) ? ['listItem'] : blocks
    if (content.some(child => !allowed.includes(child.type))) throw new Error('Invalid blog structure')
    if (type === 'listItem' && content[0]?.type !== 'paragraph') throw new Error('Lists must start with a paragraph')
    return { type, ...(Object.keys(attrs).length ? { attrs } : {}), content }
  }
  const document = visit(value)
  if (!documentText(document).trim()) throw new Error('Write some blog content before saving')
  return document
}
