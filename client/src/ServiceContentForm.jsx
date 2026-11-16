import { useRef, useState } from 'react'
import { Plus, Save, Send, X } from 'lucide-react'
import { useServices } from './ServicesContext'
import { Badge, Field, ImagePicker, Notice, PageHead, useUnsaved } from './components'
import { maxServices, serviceCategories, serviceFields, serviceIcons } from '../../shared/service-options'

export default function ServiceContentForm({ initial }) {
  const { data: record, saveServices } = useServices()
  const [draft, setDraft] = useState(initial.draft)
  const [selected, setSelected] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const form = useRef(null)
  useUnsaved(dirty)
  const current = draft.services[selected]
  const isNew = !record.draft.services.some(item => item.id === current.id)
  const hasNew = draft.services.some(item => !record.draft.services.some(saved => saved.id === item.id))

  function change(key, value) {
    setDraft(previous => ({ ...previous, services: previous.services.map((item, index) => index === selected ? { ...item, [key]: value } : item) }))
    setDirty(true); setNotice(''); setError('')
  }
  function addService() {
    if (hasNew || draft.services.length >= maxServices) return
    const service = { id: `service-${crypto.randomUUID()}`, category: 'rehabilitation', icon: 'activity', title: '', shortTitle: '', intro: '', description: '', forYou: '', focus: [''], image: '', previewImage: '' }
    setDraft(previous => ({ ...previous, services: [...previous.services, service] }))
    setSelected(draft.services.length); setDirty(true); setNotice(''); setError('')
  }
  function cancelNew() {
    if (!isNew) return
    const next = { ...draft, services: draft.services.filter((_, index) => index !== selected) }
    setDraft(next); setSelected(0); setDirty(JSON.stringify(next) !== JSON.stringify(record.draft)); setError(''); setNotice('')
  }
  async function save(publish) {
    if (busy) return
    const invalid = draft.services.findIndex(item => serviceFields.some(field => !item[field.key].trim() || item[field.key].trim().length > field.max) || !item.image.trim() || !item.previewImage.trim() || !item.focus.length || item.focus.length > 8 || item.focus.some(value => !value.trim() || value.trim().length > 300))
    if (invalid >= 0) {
      setSelected(invalid); setError('Complete every field and choose both images for this service. Add 1–8 care focus items, each within 300 characters.'); setNotice(''); return
    }
    if (!form.current.reportValidity()) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await saveServices(draft.services, record.revision, publish)
      setDraft(result.draft); setDirty(false)
      setNotice(publish ? 'Website content published. Connected visitors will receive it on their next page load.' : 'Draft saved. Your published website content is unchanged.')
    } catch (error) { setError(error.message) } finally { setBusy(false) }
  }

  return <>
    <PageHead eyebrow="WEBSITE CONTENT" title="Your services." description="Introduce your care, add a service, and publish when ready.">
      <button className="button secondary" onClick={addService} disabled={busy || hasNew || draft.services.length >= maxServices}><Plus size={16}/>Add service</button>
      <button className="button secondary" onClick={() => save(false)} disabled={busy}><Save size={16}/>Save draft</button>
      <button className="button primary" onClick={() => save(true)} disabled={busy}><Send size={16}/>{busy ? 'Saving…' : 'Publish changes'}</button>
    </PageHead>
    <Notice error>{error}</Notice><Notice>{notice}</Notice>
    <section className="content-status"><Badge status={record.revision === record.publishedRevision && !dirty ? 'Published' : 'Draft'}/><span>{dirty ? 'You have unsaved changes.' : 'Draft edits stay private until you publish.'} {draft.services.length} / {maxServices} services.</span></section>
    <form ref={form} className="panel form-panel content-form" onSubmit={event => { event.preventDefault(); save(false) }}>
      <fieldset disabled={busy}>
        <label className="field"><span>Select a service</span><select value={selected} onChange={event => { setSelected(Number(event.target.value)); setError('') }}>{draft.services.map((item, index) => <option value={index} key={item.id}>{item.shortTitle || item.title || 'New service (unsaved)'}</option>)}</select></label>
        {isNew && <div className="panel-heading service-new-heading"><div><h2>New service</h2><p>Complete the details and save before adding another service.</p></div><button className="button secondary" type="button" onClick={cancelNew}><X size={16}/>Cancel new service</button></div>}
        <div className="form-grid">
          <div className="field"><label htmlFor="service-category">Service category</label><select id="service-category" value={current.category} onChange={event => change('category', event.target.value)}>{serviceCategories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          <div className="field"><label htmlFor="service-icon">Service icon</label><select id="service-icon" value={current.icon} onChange={event => change('icon', event.target.value)}>{serviceIcons.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        </div>
        {serviceFields.map(({ key, label, max, rows }) => <Field key={`${current.id}-${key}`} label={label} required maxLength={max} value={current[key]} textarea={!!rows} rows={rows} hint={`${current[key].length} / ${max} characters`} onChange={event => change(key, event.target.value)}/>)}
        <Field label="Care focus (one item per line)" required textarea rows={4} value={current.focus.join('\n')} hint="Add 1–8 items, up to 300 characters per item." onChange={event => change('focus', event.target.value.split('\n'))}/>
        <div className="form-grid"><ImagePicker label="Service image" value={current.image} onChange={value => change('image', value)}/><ImagePicker label="Homepage preview image" value={current.previewImage} onChange={value => change('previewImage', value)}/></div>
      </fieldset>
    </form>
  </>
}
