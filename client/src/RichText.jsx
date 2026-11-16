import { createElement, Fragment } from 'react'
import { safeLink } from '../../shared/rich-text.js'
import './rich-text.css'

export default function RichText({ body }) {
  function render(node, key, depth = 0) {
    if (!node || depth > 12) return null
    if (node.type === 'text') {
      let text = node.text
      for (const mark of node.marks || []) {
        const tag = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' }[mark.type]
        if (tag) text = createElement(tag, null, text)
        else if (mark.type === 'link' && safeLink(mark.attrs?.href)) text = <a href={mark.attrs.href} target="_blank" rel="noopener noreferrer">{text}</a>
      }
      return <Fragment key={key}>{text}</Fragment>
    }
    const tag = { doc: 'div', paragraph: 'p', heading: `h${[2, 3, 4].includes(node.attrs?.level) ? node.attrs.level : 2}`, bulletList: 'ul', orderedList: 'ol', listItem: 'li', blockquote: 'blockquote', hardBreak: 'br', horizontalRule: 'hr' }[node.type]
    if (!tag) return null
    const props = { key }
    if (node.type === 'heading') props.id = `heading-${key}`
    if (['left', 'center', 'right', 'justify'].includes(node.attrs?.textAlign)) props.style = { textAlign: node.attrs.textAlign }
    if (node.type === 'orderedList') props.start = node.attrs?.start || 1
    return createElement(tag, props, ...((node.content || []).map((child, index) => render(child, `${key}-${index}`, depth + 1))))
  }
  return <div className="rich-text">{render(body, 'body')}</div>
}
