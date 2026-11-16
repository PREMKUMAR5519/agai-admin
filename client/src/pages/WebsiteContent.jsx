import { useRef, useState } from 'react'
import { Save, Send } from 'lucide-react'
import { api } from '../api'
import { Badge, Field, ImagePicker, Loading, Notice, PageHead, useResource, useUnsaved } from '../components'

const tabs = ['Services']
export default function WebsiteContent() {
  const { data, error } = useResource('/content')
  if (error) return <Notice error>{error}</Notice>
  if (!data) return <Loading/>
  return <ContentForm initial={data}/>
}
function ContentForm({ initial }) {
  const [record, setRecord] = useState(initial)
  const [draft, setDraft] = useState(initial.draft)
  const [tab, setTab] = useState(tabs[0])
  const [service, setService] = useState(0)
  const [dirty, setDirty] = useState(false)
  useUnsaved(dirty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const form = useRef(null)
  function listChange(group, index, key, value) { setDraft(current => ({ ...current, [group]: current[group].map((item, position) => position === index ? { ...item, [key]: value } : item) })); setDirty(true); setNotice('') }
  async function save(publish) {
    if (!form.current.reportValidity()) return
    setBusy(true); setError(''); setNotice('')
    try { let result = await api('/content', { method: 'PUT', body: { revision: record.revision, data: draft } }); setRecord(result); setDirty(false); if (publish) { result = await api('/content/publish', { method: 'POST', body: { revision: result.revision } }); setRecord(result) } setNotice(publish ? 'Website content published. Connected visitors will receive it on their next page load.' : 'Draft saved. Your published website content is unchanged.') } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  const current = draft.services[service]
  return <><PageHead eyebrow="THE ESSENTIALS, KEPT WITH CARE" title="Your website. Your story." description="A clear welcome, helpful details, and a little of what makes AGAI special."><button className="button secondary" onClick={() => save(false)} disabled={busy}><Save size={16}/>Save draft</button><button className="button primary" onClick={() => save(true)} disabled={busy}><Send size={16}/>{busy ? 'Saving…' : 'Publish changes'}</button></PageHead><Notice error>{error}</Notice><Notice>{notice}</Notice><section className="content-status"><Badge status={record.revision === record.publishedRevision && !dirty ? 'Published' : 'Draft'}/><span>{dirty ? 'You have unsaved changes.' : 'Draft edits stay private until you publish.'}</span></section><div className="content-layout"><nav className="content-tabs" aria-label="Content sections">{tabs.map((name, index) => <button className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}><span>0{index + 1}</span>{name}</button>)}</nav><form ref={form} className="panel form-panel content-form" onSubmit={event => { event.preventDefault(); save(false) }}><fieldset disabled={busy}><p className="eyebrow">{tab.toUpperCase()}</p><h2>{({ Services: 'Help people find their next step.' })[tab]}</h2>{tab === 'Services' && <><label className="field"><span>Select a service</span><select value={service} onChange={event => setService(Number(event.target.value))}>{draft.services.map((item, index) => <option value={index} key={item.id}>{item.shortTitle}</option>)}</select></label>{['title', 'shortTitle', 'intro', 'description', 'forYou'].map(key => <Field key={`${service}-${key}`} label={({ title: 'Service title', shortTitle: 'Short title', intro: 'Short introduction', description: 'Description', forYou: 'Who is this for?' })[key]} required value={current[key]} textarea={['description', 'forYou'].includes(key)} rows={3} onChange={event => listChange('services', service, key, event.target.value)}/>)}<Field label="Care focus (one item per line)" textarea rows={4} value={current.focus.join('\n')} onChange={event => listChange('services', service, 'focus', event.target.value.split('\n'))}/><ImagePicker label="Service image" value={current.image} onChange={value => listChange('services', service, 'image', value)}/><ImagePicker label="Homepage preview image" value={current.previewImage} onChange={value => listChange('services', service, 'previewImage', value)}/></>}</fieldset></form></div></>
}
