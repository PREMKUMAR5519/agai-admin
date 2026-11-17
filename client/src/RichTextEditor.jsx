import { useEffect, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote, Link, Unlink, Undo2, Redo2, Minus } from 'lucide-react'
import { safeLink } from '../../shared/rich-text.js'
import './rich-text.css'

const extensions = [StarterKit.configure({ heading: { levels: [2, 3, 4] }, code: false, codeBlock: false, link: { openOnClick: false, protocols: ['http', 'https', 'mailto'], isAllowedUri: url => safeLink(url) } }), TextAlign.configure({ types: ['heading', 'paragraph'] })]

export default function RichTextEditor({ value, onChange, disabled, error, focusRequest }) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')
  const editor = useEditor({
    extensions, content: value, immediatelyRender: false,
    editorProps: { attributes: { id: 'blog-body', role: 'textbox', 'aria-label': 'Blog content', 'aria-multiline': 'true', 'aria-invalid': error ? 'true' : 'false', 'aria-describedby': error ? 'blog-body-error' : 'blog-body-hint', class: 'rich-text' } },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  })
  const state = useEditorState({ editor, selector: ({ editor }) => editor ? {
    heading: [2, 3, 4].find(level => editor.isActive('heading', { level })) || 0,
    active: Object.fromEntries(['bold', 'italic', 'underline', 'strike', 'bulletList', 'orderedList', 'blockquote', 'link'].map(name => [name, editor.isActive(name)])),
    align: editor.getAttributes('paragraph').textAlign || editor.getAttributes('heading').textAlign || 'left',
    undo: editor.can().undo(), redo: editor.can().redo(),
  } : null }) || { heading: 0, active: {}, align: 'left', undo: false, redo: false }
  useEffect(() => { editor?.setEditable(!disabled, false) }, [editor, disabled])
  useEffect(() => {
    if (!editor || !focusRequest) return
    editor.commands.focus()
    editor.view.dom.scrollIntoView({ block: 'center' })
  }, [editor, focusRequest])
  if (!editor) return <p>Loading editor...</p>
  const tool = (label, Icon, action, active = false, unavailable = false) => <button key={label} type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled || unavailable} onMouseDown={event => event.preventDefault()} onClick={action}><Icon size={18} aria-hidden="true"/></button>
  function applyLink() {
    if (!safeLink(linkUrl.trim())) { setLinkError('Enter a complete https://, http:// or mailto: link.'); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run()
    setLinkOpen(false); setLinkError('')
  }
  return <div className="rich-editor">
    <div className="rich-toolbar" role="group" aria-label="Blog formatting">
      <select aria-label="Text style" value={state.heading} disabled={disabled} onChange={event => event.target.value === '0' ? editor.chain().focus().setParagraph().run() : editor.chain().focus().setHeading({ level: Number(event.target.value) }).run()}>
        <option value="0">Paragraph</option><option value="2">Heading 2</option><option value="3">Heading 3</option><option value="4">Heading 4</option>
      </select>
      {tool('Bold', Bold, () => editor.chain().focus().toggleBold().run(), state.active.bold)}
      {tool('Italic', Italic, () => editor.chain().focus().toggleItalic().run(), state.active.italic)}
      {tool('Underline', Underline, () => editor.chain().focus().toggleUnderline().run(), state.active.underline)}
      {tool('Strikethrough', Strikethrough, () => editor.chain().focus().toggleStrike().run(), state.active.strike)}
      <span className="toolbar-divider"/>
      {tool('Bullet list', List, () => editor.chain().focus().toggleBulletList().run(), state.active.bulletList)}
      {tool('Numbered list', ListOrdered, () => editor.chain().focus().toggleOrderedList().run(), state.active.orderedList)}
      {tool('Quote', Quote, () => editor.chain().focus().toggleBlockquote().run(), state.active.blockquote)}
      {tool('Divider', Minus, () => editor.chain().focus().setHorizontalRule().run())}
      <span className="toolbar-divider"/>
      {[[AlignLeft, 'left'], [AlignCenter, 'center'], [AlignRight, 'right'], [AlignJustify, 'justify']].map(([Icon, align]) => tool(`Align ${align}`, Icon, () => editor.chain().focus().setTextAlign(align).run(), state.align === align))}
      {tool('Add link', Link, () => { setLinkUrl(editor.getAttributes('link').href || ''); setLinkError(''); setLinkOpen(true) }, state.active.link)}
      {tool('Remove link', Unlink, () => editor.chain().focus().unsetLink().run(), false, !state.active.link)}
      {tool('Undo', Undo2, () => editor.chain().focus().undo().run(), false, !state.undo)}
      {tool('Redo', Redo2, () => editor.chain().focus().redo().run(), false, !state.redo)}
    </div>
    {linkOpen && <div className="editor-link-panel">
      <label htmlFor="editor-link">Link URL</label><input id="editor-link" value={linkUrl} onChange={event => setLinkUrl(event.target.value)} placeholder="https://example.com" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyLink() } if (event.key === 'Escape') setLinkOpen(false) }}/>
      <button type="button" className="button secondary" onClick={applyLink} disabled={disabled}>Apply link</button><button type="button" className="text-button" onClick={() => { setLinkOpen(false); editor.commands.focus() }}>Cancel</button>
      {linkError && <p role="alert">{linkError}</p>}
    </div>}
    <EditorContent editor={editor}/>
    {error && <p id="blog-body-error" className="blog-field-error">{error}</p>}
    <div id="blog-body-hint" className="rich-editor-hint">Write your blog here. Select text to format it.</div>
  </div>
}
