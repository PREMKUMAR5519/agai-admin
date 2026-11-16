import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Plus, Save, Send, Trash2 } from 'lucide-react'
import { api, assetUrl, postStatus } from '../api'
import { Badge, Field, ImagePicker, Loading, Notice, PageHead, useUnsaved } from '../components'

const blank = () => ({ title: '', slug: '', category: 'Getting started', excerpt: '', image: '', imageAlt: '', sections: [{ heading: '', text: '' }] })
const slugify = value => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 160)
export default function ArticleEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [record, setRecord] = useState(null)
  const [draft, setDraft] = useState(blank)
  const [loading, setLoading] = useState(Boolean(id))
  const [dirty, setDirty] = useState(false)
  const allowNavigation = useUnsaved(dirty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(false)
  const form = useRef(null)
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    setLoading(true)
    api(`/posts/${id}`, { signal: controller.signal }).then(data => { setRecord(data); setDraft(data.draft); setDirty(false) }).catch(error => { if (error.name !== 'AbortError') setError(error.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id])
  function change(key, value) { setDraft(current => ({ ...current, [key]: value })); setDirty(true); setNotice('') }
  function section(index, key, value) { change('sections', draft.sections.map((item, position) => position === index ? { ...item, [key]: value } : item)) }
  function move(index, direction) { const sections = [...draft.sections]; [sections[index], sections[index + direction]] = [sections[index + direction], sections[index]]; change('sections', sections) }
  async function save(publish = false) {
    if (!form.current.reportValidity()) return
    setBusy(true); setError(''); setNotice('')
    try {
      let result = record ? await api(`/posts/${record._id}`, { method: 'PUT', body: { revision: record.revision, data: draft } }) : await api('/posts', { method: 'POST', body: draft })
      setRecord(result); setDirty(false); allowNavigation()
      if (publish) { result = await api(`/posts/${result._id}/publish`, { method: 'POST', body: { revision: result.revision } }); setRecord(result) }
      setNotice(publish ? 'Article published. It is now available through the website content API.' : 'Draft saved. Your published article is unchanged.')
      if (!id) navigate(`/journal/${result._id}`, { replace: true })
    } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  async function action(name) {
    if (dirty && !window.confirm('This action will discard your unsaved edits. Continue?')) return
    if (['archive', 'unpublish'].includes(name) && !window.confirm(`${name === 'archive' ? 'Archive' : 'Unpublish'} this article? It will be removed from the public content API.`)) return
    setBusy(true); setError('')
    try { const result = await api(`/posts/${record._id}/${name}`, { method: 'POST', body: { revision: record.revision } }); setRecord(result); setDraft(result.draft); setDirty(false); setNotice(name === 'restore' ? 'Restored as a draft. Publish when you are ready.' : `Article ${name === 'archive' ? 'archived' : 'unpublished'}.`) } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  if (loading) return <Loading/>
  if (id && !record) return <Notice error>{error || 'Article not found'}</Notice>
  const words = draft.sections.reduce((sum, item) => sum + item.text.trim().split(/\s+/).filter(Boolean).length, 0)
  return <><Link className="text-button back-link" to="/journal"><ArrowLeft size={16}/>Back to journal</Link><PageHead eyebrow="MAKE ROOM FOR A GOOD READ" title={id ? 'Shape your story.' : 'A new chapter starts here.'} description={dirty ? 'You have unsaved changes.' : 'Thoughtful words, at your own pace.'}><button className="button secondary" onClick={() => setPreview(!preview)}><Eye size={17}/>{preview ? 'Back to editor' : 'Preview'}</button>{!record?.archived && <><button className="button secondary" disabled={busy} onClick={() => save()}><Save size={16}/>Save draft</button><button className="button primary" disabled={busy} onClick={() => save(true)}><Send size={16}/>{busy ? 'Saving…' : 'Publish article'}</button></>}</PageHead><Notice error>{error}</Notice><Notice>{notice}</Notice><div className="editor-layout"><form ref={form} onSubmit={event => { event.preventDefault(); save() }} className={`editor-main ${preview ? 'preview-hidden' : ''}`}><fieldset disabled={busy || record?.archived}><section className="panel form-panel"><p className="eyebrow">THE INTRODUCTION</p><Field label="Article title" value={draft.title} required maxLength={180} onChange={event => { const value = event.target.value; setDraft(current => ({ ...current, title: value, slug: !record && current.slug === slugify(current.title) ? slugify(value) : current.slug })); setDirty(true) }} placeholder="A little insight worth sharing…"/><Field label="Short introduction" textarea rows={3} value={draft.excerpt} required maxLength={400} onChange={event => change('excerpt', event.target.value)} hint={`${draft.excerpt.length}/400 characters · Shown on article cards and in search descriptions.`}/></section><section className="panel form-panel"><div className="panel-heading flush"><div><p className="eyebrow">THE STORY</p><h2>Give your ideas a little space.</h2></div><span className="subtle-tag">{words} WORDS</span></div>{draft.sections.map((item, index) => <div className="story-section" key={index}><div className="story-section-top"><span>SECTION {String(index + 1).padStart(2, '0')}</span><div><button type="button" className="icon-button" disabled={index === 0} aria-label={`Move section ${index + 1} up`} onClick={() => move(index, -1)}><ArrowUp size={15}/></button><button type="button" className="icon-button" disabled={index === draft.sections.length - 1} aria-label={`Move section ${index + 1} down`} onClick={() => move(index, 1)}><ArrowDown size={15}/></button><button type="button" className="icon-button danger" disabled={draft.sections.length === 1} aria-label={`Remove section ${index + 1}`} onClick={() => change('sections', draft.sections.filter((_, position) => position !== index))}><Trash2 size={15}/></button></div></div><Field label={`Section ${index + 1} heading`} value={item.heading} required maxLength={180} onChange={event => section(index, 'heading', event.target.value)} placeholder="Start with a clear idea"/><Field label={`Section ${index + 1} text`} textarea rows={7} value={item.text} required maxLength={15000} onChange={event => section(index, 'text', event.target.value)} placeholder="Write in your own words…"/></div>)}<button type="button" className="button secondary" disabled={draft.sections.length >= 40} onClick={() => change('sections', [...draft.sections, { heading: '', text: '' }])}><Plus size={16}/>Add a section</button></section></fieldset></form>{preview && <article className="panel article-preview"><span className="category-label">{draft.category}</span><h1>{draft.title || 'Your article title'}</h1><p className="preview-intro">{draft.excerpt}</p>{draft.image && <img src={assetUrl(draft.image)} alt={draft.imageAlt}/>}<span className="subtle-tag">{Math.max(1, Math.ceil(words / 200))} MIN READ · DRAFT PREVIEW</span>{draft.sections.map((item, index) => <section key={index}><h2>{item.heading}</h2><p>{item.text}</p></section>)}</article>}<aside className="editor-aside"><section className="panel form-panel"><div className="status-line"><h3>Publishing</h3><Badge status={record ? postStatus(record) : 'Draft'}/></div><fieldset disabled={busy || record?.archived}><Field label="Category" value={draft.category} required maxLength={80} list="article-categories" onChange={event => change('category', event.target.value)}/><datalist id="article-categories"><option>Getting started</option><option>Movement goals</option><option>Everyday wellbeing</option></datalist><Field label="URL slug" value={draft.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={160} onChange={event => change('slug', event.target.value)} hint="Lowercase words separated by hyphens."/><p className="url-preview">agaiphysiotherapy.com/blogs/<strong>{draft.slug || 'your-story'}</strong></p><ImagePicker value={draft.image} onChange={value => change('image', value)}/><Field label="Image description (alt text)" value={draft.imageAlt} maxLength={200} onChange={event => change('imageAlt', event.target.value)} hint="Describe the image for readers using assistive technology."/></fieldset></section><div className="editor-tip"><span className="eyebrow">A THOUGHTFUL REMINDER</span><p>Keep your words clear, useful and kind. General information should support a conversation with a physiotherapist.</p></div>{record && <section className="panel form-panel"><h3>Article actions</h3>{record.archived ? <button className="button secondary" disabled={busy} onClick={() => action('restore')}>Restore to drafts</button> : <><p className="muted">Archived articles are kept safely and can be restored.</p>{record.published && <button className="text-button" disabled={busy} onClick={() => action('unpublish')}>Unpublish article</button>}<button className="text-button danger" disabled={busy} onClick={() => action('archive')}><Trash2 size={15}/>Archive article</button></>}</section>}</aside></div></>
}
