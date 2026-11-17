import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Eye, FileText, Image as ImageIcon, List, Plus, Save, Search, Send, Trash2, X } from 'lucide-react'
import DeleteServiceDialog from './DeleteServiceDialog'
import { useServices } from './ServicesContext'
import { assetUrl } from './api'
import { Field, ImagePicker, Notice, PageHead, useUnsaved } from './components'
import { maxServices, serviceCategories, serviceFields, serviceIcons } from '../../shared/service-options'
import './services-editor.css'

const sections = [
  { id: 'overview', label: 'Overview', icon: FileText },
  { id: 'details', label: 'Details', icon: List },
  { id: 'images', label: 'Images', icon: ImageIcon },
  { id: 'preview', label: 'Preview', icon: Eye },
]
const fieldHelp = {
  title: 'The main heading on your Services page.',
  shortTitle: 'A shorter name for cards and appointment choices.',
  intro: 'A quick explanation of how this service helps.',
  description: 'Explain your approach and what a visitor can expect.',
  forYou: 'Help visitors decide whether this service is right for them.',
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const categoryName = value => serviceCategories.find(category => category.value === value)?.label || value

export default function ServiceContentForm({ initial }) {
  const { data: record, saveServices, deleteService } = useServices()
  const [draft, setDraft] = useState(initial.draft)
  const [selected, setSelected] = useState(0)
  const [section, setSection] = useState('overview')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All services')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [invalidTarget, setInvalidTarget] = useState(null)
  const form = useRef(null)
  const feedback = useRef(null)
  const dirty = !same(draft, record.draft)
  useUnsaved(dirty)
  const current = draft.services[selected]
  const isNew = !record.draft.services.some(item => item.id === current.id)
  const hasNew = draft.services.some(item => !record.draft.services.some(saved => saved.id === item.id))
  const lastService = record.draft.services.length === 1 || (record.published.services.length === 1 && record.published.services[0].id === current.id)
  const unsavedCount = draft.services.filter(item => !same(item, record.draft.services.find(saved => saved.id === item.id))).length
  const unpublishedCount = draft.services.filter(item => !same(item, record.published.services.find(saved => saved.id === item.id))).length

  function statusOf(item) {
    const saved = record.draft.services.find(service => service.id === item.id)
    if (!saved) return 'New'
    if (!same(item, saved)) return 'Unsaved'
    return same(item, record.published.services.find(service => service.id === item.id)) ? 'Published' : 'Draft'
  }
  const visible = draft.services.map((item, index) => ({ item, index, status: statusOf(item) })).filter(({ item, status }) =>
    (filter === 'All services' || (filter === 'Unsaved' ? ['New', 'Unsaved'].includes(status) : filter === status)) &&
    `${item.title} ${item.shortTitle} ${categoryName(item.category)}`.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    if (!invalidTarget) return
    const field = form.current?.querySelector(`[id="${invalidTarget.id}"]`)
    field?.focus({ preventScroll: true })
    field?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [invalidTarget])

  function selectService(index) { setSelected(index); setError(''); setInvalidTarget(null); setLibraryOpen(false) }
  function change(key, value) {
    setDraft(previous => ({ ...previous, services: previous.services.map((item, index) => index === selected ? { ...item, [key]: value } : item) }))
    setNotice(''); setError(''); setInvalidTarget(null)
  }
  function addService() {
    if (busy || hasNew || draft.services.length >= maxServices) return
    const service = { id: `service-${crypto.randomUUID()}`, category: 'rehabilitation', icon: 'activity', title: '', shortTitle: '', intro: '', description: '', forYou: '', focus: [''], image: '', previewImage: '' }
    setDraft(previous => ({ ...previous, services: [...previous.services, service] }))
    setSelected(draft.services.length); setSection('overview'); setQuery(''); setFilter('All services'); setNotice(''); setError('')
    setInvalidTarget({ id: 'service-field-title' })
  }
  function cancelNew() {
    if (!isNew) return
    setDraft(previous => ({ ...previous, services: previous.services.filter((_, index) => index !== selected) }))
    setSelected(0); setError(''); setNotice(''); setInvalidTarget(null)
  }
  function showInvalid(index, tab, id, message) {
    setSelected(index); setSection(tab); setQuery(''); setFilter('All services')
    setError(`${draft.services[index].shortTitle || 'New service'}: ${message}`); setNotice(''); setInvalidTarget({ id })
  }
  async function save(publish) {
    if (busy) return
    for (const [index, item] of draft.services.entries()) {
      for (const field of serviceFields) {
        if (!item[field.key].trim() || item[field.key].trim().length > field.max) {
          showInvalid(index, ['description', 'forYou'].includes(field.key) ? 'details' : 'overview', `service-field-${field.key}`, `Add ${field.label.toLowerCase()} within ${field.max} characters.`)
          return
        }
      }
      const emptyFocus = item.focus.findIndex(value => !value.trim() || value.trim().length > 300)
      if (!item.focus.length || item.focus.length > 8 || emptyFocus >= 0) {
        showInvalid(index, 'details', `service-focus-${Math.max(0, emptyFocus)}`, 'Add 1–8 care focus items, each within 300 characters.'); return
      }
      if (!item.image.trim() || !item.previewImage.trim()) {
        showInvalid(index, 'images', !item.image.trim() ? 'service-image-url' : 'service-preview-url', 'Choose both a service image and a homepage preview image.'); return
      }
    }
    setBusy(publish ? 'publish' : 'save'); setError(''); setNotice('')
    try {
      const result = await saveServices(draft.services, record.revision, publish)
      setDraft(result.draft)
      setNotice(publish ? 'Website content published. Your service updates are ready for visitors.' : 'Draft saved. Your published website content is unchanged.')
    } catch (error) { setError(error.message) } finally { setBusy(''); feedback.current?.scrollIntoView({ block: 'nearest' }) }
  }
  async function confirmDelete(password) {
    setBusy('delete'); setError(''); setNotice('')
    try {
      await deleteService(deleteTarget.id, record.revision, password)
      const next = { ...draft, services: draft.services.filter(item => item.id !== deleteTarget.id) }
      setDraft(next); setSelected(Math.min(selected, next.services.length - 1))
      setDeleteTarget(null); setNotice('Service permanently deleted from the database and published content.')
    } finally { setBusy('') }
  }
  function renderField(key) {
    const { label, max, rows } = serviceFields.find(field => field.key === key)
    return <Field key={key} id={`service-field-${key}`} label={label} required maxLength={max} value={current[key]} textarea={!!rows} rows={rows} hint={`${fieldHelp[key]} ${current[key].length} / ${max}`} aria-invalid={invalidTarget?.id === `service-field-${key}` && !!error} onChange={event => change(key, event.target.value)}/>
  }
  function moveTab(event, index) {
    let next
    if (event.key === 'ArrowRight') next = (index + 1) % sections.length
    if (event.key === 'ArrowLeft') next = (index - 1 + sections.length) % sections.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = sections.length - 1
    if (next === undefined) return
    event.preventDefault(); setSection(sections[next].id)
    document.getElementById(`service-tab-${sections[next].id}`)?.focus()
  }

  return <div className="services-workspace">
    <PageHead eyebrow="WEBSITE CONTENT" title="Your services." description="Find a service, make your changes, and preview before publishing.">
      <button className="button secondary" onClick={addService} disabled={!!busy || hasNew || draft.services.length >= maxServices}><Plus size={17}/>Add service</button>
    </PageHead>
    <div className="services-savebar">
      <div><strong>{unsavedCount ? `${unsavedCount} service${unsavedCount === 1 ? '' : 's'} with unsaved edits` : unpublishedCount ? 'Saved drafts ready to publish' : 'All services are up to date'}</strong><span>Save keeps edits private. Publish updates all service drafts.</span></div>
      <div className="services-save-actions"><button className="button secondary" onClick={() => save(false)} disabled={!!busy || !dirty}><Save size={16}/>{busy === 'save' ? 'Saving…' : 'Save draft'}</button><button className="button primary" onClick={() => save(true)} disabled={!!busy || (!dirty && !unpublishedCount)}><Send size={16}/>{busy === 'publish' ? 'Publishing…' : 'Publish changes'}</button></div>
    </div>
    <div ref={feedback} className="services-feedback"><Notice error>{error}</Notice><Notice>{notice}</Notice></div>
    <div className="services-workbench">
      <button className="button secondary services-library-toggle" type="button" aria-expanded={libraryOpen} aria-controls="service-library" onClick={() => setLibraryOpen(value => !value)}><List size={18}/>{libraryOpen ? 'Close service list' : 'Choose a service'}<span>{draft.services.length} services</span></button>
      <aside id="service-library" className={`panel services-library ${libraryOpen ? 'is-open' : ''}`} aria-label="Service library">
        <div className="services-library-head"><h2>Services <span>{draft.services.length}</span></h2><p>Select a service to start editing.</p></div>
        <div className="services-library-filters"><label className="services-search"><Search size={17}/><input type="search" aria-label="Search services" placeholder="Search services…" value={query} disabled={!!busy} onChange={event => setQuery(event.target.value)}/></label><select aria-label="Filter services by status" value={filter} disabled={!!busy} onChange={event => setFilter(event.target.value)}>{['All services', 'Unsaved', 'Draft', 'Published'].map(value => <option key={value}>{value}</option>)}</select></div>
        <nav className="services-list" aria-label="Choose a service">{visible.map(({ item, index, status }) => <button key={item.id} type="button" className={`service-list-item ${index === selected ? 'selected' : ''}`} aria-label={`Edit ${item.shortTitle || item.title || 'new service'}`} aria-current={index === selected ? 'true' : undefined} disabled={!!busy} onClick={() => selectService(index)}><span className="service-list-thumb">{item.previewImage ? <img src={assetUrl(item.previewImage)} alt="" loading="lazy"/> : <FileText size={19}/>}</span><span className="service-list-copy"><strong>{item.shortTitle || item.title || 'New service'}</strong><span className={`service-state state-${status.toLowerCase()}`}>{status}</span></span><ChevronRight size={15}/></button>)}</nav>
        {!visible.length && <div className="services-no-results"><p>No matching services.</p><button className="text-button" onClick={() => { setQuery(''); setFilter('All services') }}>Clear filters</button></div>}
        <div className="services-library-footer">{visible.length} shown · {draft.services.length} / {maxServices} services</div>
      </aside>
      <div className="services-editor-column">
        <section className="panel services-editor">
          <header className="services-editor-heading"><div><span className="eyebrow">{isNew ? 'NEW SERVICE' : 'EDITING SERVICE'}</span><h2>{current.shortTitle || current.title || 'Give your service a name'}</h2><p>{categoryName(current.category)}</p></div><span className={`service-state state-${statusOf(current).toLowerCase()}`}>{statusOf(current)}</span></header>
          {isNew && <div className="services-new-note"><span>Complete the details and save before adding another service.</span><button className="text-button" type="button" disabled={!!busy} onClick={cancelNew}><X size={15}/>Cancel new service</button></div>}
          <div className="services-section-tabs" role="tablist" aria-label="Service editing sections">{sections.map(({ id, label, icon: Icon }, index) => <button key={id} id={`service-tab-${id}`} type="button" role="tab" aria-selected={section === id} aria-controls={`service-panel-${id}`} tabIndex={section === id ? 0 : -1} onKeyDown={event => moveTab(event, index)} onClick={() => setSection(id)}><Icon size={17}/>{label}</button>)}</div>
          <form ref={form} noValidate onSubmit={event => { event.preventDefault(); save(false) }}>
            <fieldset disabled={!!busy}>
              <div className="services-tab-panel" id="service-panel-overview" role="tabpanel" aria-labelledby="service-tab-overview" hidden={section !== 'overview'}>
                <div className="services-section-intro"><h3>Introduce this service</h3><p>Give visitors a clear name and a short, helpful introduction.</p></div>
                {renderField('title')}{renderField('shortTitle')}{renderField('intro')}
                <div className="form-grid"><div className="field"><label htmlFor="service-category">Service category</label><select id="service-category" value={current.category} onChange={event => change('category', event.target.value)}>{serviceCategories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><div className="field"><label htmlFor="service-icon">Service icon</label><select id="service-icon" value={current.icon} onChange={event => change('icon', event.target.value)}>{serviceIcons.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div></div>
              </div>
              <div className="services-tab-panel" id="service-panel-details" role="tabpanel" aria-labelledby="service-tab-details" hidden={section !== 'details'}>
                <div className="services-section-intro"><h3>Help visitors understand your care</h3><p>Keep the language simple and focus on what matters to your visitors.</p></div>
                {renderField('description')}{renderField('forYou')}
                <div className="services-focus-heading"><h3>Care focus</h3><p>The key points shown as a list on your Services page. Add up to 8.</p></div>
                {current.focus.map((value, index) => <div className="services-focus-row" key={`${current.id}-${index}`}><Field id={`service-focus-${index}`} label={`Care focus ${index + 1}`} value={value} required maxLength={300} hint={`${value.length} / 300 characters`} onChange={event => change('focus', current.focus.map((item, position) => position === index ? event.target.value : item))}/><button type="button" className="icon-button danger" aria-label={`Remove care focus ${index + 1}`} disabled={current.focus.length <= 1} onClick={() => change('focus', current.focus.filter((_, position) => position !== index))}><X size={17}/></button></div>)}
                <button className="button secondary" type="button" disabled={current.focus.length >= 8} onClick={() => change('focus', [...current.focus, ''])}><Plus size={16}/>Add care focus</button>
              </div>
              <div className="services-tab-panel" id="service-panel-images" role="tabpanel" aria-labelledby="service-tab-images" hidden={section !== 'images'}>
                <div className="services-section-intro"><h3>Choose your images</h3><p>Pick an existing image from the media library or upload a new one.</p></div>
                <div className="services-image-grid"><div><ImagePicker label="Service image" inputId="service-image-url" value={current.image} onChange={value => change('image', value)}/><p className="services-image-help">The main image on your Services page.</p></div><div><ImagePicker label="Homepage preview image" inputId="service-preview-url" value={current.previewImage} onChange={value => change('previewImage', value)}/><p className="services-image-help">The smaller image in the homepage service cards.</p></div></div>
                <button type="button" className="text-button" disabled={!current.image} onClick={() => change('previewImage', current.image)}>Use the service image for both</button>
              </div>
              <div className="services-tab-panel" id="service-panel-preview" role="tabpanel" aria-labelledby="service-tab-preview" hidden={section !== 'preview'}>
                <div className="services-section-intro"><h3>Preview your draft</h3><p>A content preview. The website adjusts the layout for each screen.</p></div>
                <article className="service-draft-preview">{current.image ? <img src={assetUrl(current.image)} alt=""/> : <div className="service-preview-placeholder"><ImageIcon size={30}/><span>Add a service image</span></div>}<div><span className="eyebrow">{categoryName(current.category)}</span><h2>{current.title || 'Your service title'}</h2><p className="service-preview-intro">{current.intro || 'Your short introduction will appear here.'}</p><p>{current.description}</p>{current.forYou && <><h3>Who is this for?</h3><p>{current.forYou}</p></>}{current.focus.some(item => item.trim()) && <><h3>Care focus</h3><ul>{current.focus.filter(item => item.trim()).map((item, index) => <li key={index}>{item}</li>)}</ul></>}</div></article>
              </div>
            </fieldset>
          </form>
        </section>
        {!isNew && <section className="services-delete-card"><div><h3>Delete this service</h3><p>{lastService ? 'Add and publish a replacement before deleting your last service.' : 'Permanent deletion requires your admin password.'}</p></div><button className="button secondary danger" type="button" disabled={!!busy || lastService} onClick={() => setDeleteTarget(current)}><Trash2 size={16}/>Delete service</button></section>}
      </div>
    </div>
    {deleteTarget && <DeleteServiceDialog service={deleteTarget} hasUnsavedChanges={dirty} onDelete={confirmDelete} onClose={() => setDeleteTarget(null)}/>}
  </div>
}
