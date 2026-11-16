import { uploadImage } from './image-upload'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useBlocker } from 'react-router'
import { AlertCircle, ArrowLeft, LoaderCircle, Upload, X } from 'lucide-react'
import { api, assetUrl } from './api'

export function useResource(path) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError('')
    api(path, { signal: controller.signal }).then(setData).catch(error => { if (error.name !== 'AbortError') setError(error.message) })
    return () => controller.abort()
  }, [path, version])
  return { data, setData, error, reload: useCallback(() => setVersion(value => value + 1), []) }
}
export function useUnsaved(dirty) {
  const ref = useRef(dirty)
  ref.current = dirty
  const blocker = useBlocker(useCallback(() => ref.current, []))
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('You have unsaved changes. Leave without saving?')) blocker.proceed()
      else blocker.reset()
    }
  }, [blocker])
  useEffect(() => {
    const listener = event => { if (ref.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', listener)
    return () => window.removeEventListener('beforeunload', listener)
  }, [])
  return () => { ref.current = false }
}
export function Loading() { return <div className="loading" role="status"><LoaderCircle className="spin"/>Loading your workspace…</div> }
export function Notice({ error, children }) { return children ? <div className={`notice ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>{error && <AlertCircle size={18}/>}<span>{children}</span></div> : null }
export function Field({ label, hint, textarea, ...props }) {
  const generatedId = useId()
  const id = props.id || generatedId
  const accessibility = { id, 'aria-describedby': hint ? `${id}-hint` : undefined }
  return <div className="field"><label htmlFor={id}>{label}</label>{textarea ? <textarea {...props} {...accessibility}/> : <input {...props} {...accessibility}/>} {hint && <small id={`${id}-hint`}>{hint}</small>}</div>
}
export function PageHead({ eyebrow, title, description, children }) { return <div className="page-head"><div><p className="eyebrow">{eyebrow || 'YOUR WORKSPACE'}</p><h1>{title}</h1>{description && <p>{description}</p>}</div><div className="head-actions">{children}</div></div> }
export function Badge({ status }) { return <span className={`badge ${status.toLowerCase().replaceAll(' ', '-')}`}><i/>{status}</span> }
export function Empty({ title, children }) { return <div className="empty"><div className="empty-mark">A</div><h3>{title}</h3>{children}</div> }
export function ImagePicker({ value, onChange, label = 'Cover image' }) {
  const [open, setOpen] = useState(false)
  return <div className="image-picker"><span className="field-label">{label}</span><button type="button" className="image-select" onClick={() => setOpen(true)}>{value ? <img src={assetUrl(value)} alt="Selected image"/> : <Upload/>}<span>{value ? 'Change image' : 'Choose or upload image'}</span></button><Field label="Image URL" value={value} onChange={event => onChange(event.target.value)} placeholder="https://…" hint="Use your media library or an existing image URL."/>{open && <MediaDialog onClose={() => setOpen(false)} onSelect={url => { onChange(url); setOpen(false) }}/>}</div>
}
function MediaDialog({ onClose, onSelect }) {
  const dialog = useRef(null)
  const { data, setData, error } = useResource('/media')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { dialog.current.showModal(); const element = dialog.current; return () => element.close() }, [])
  async function upload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true); setMessage('')
    try { const media = await uploadImage(file); setData(items => [media, ...(items || [])]); onSelect(media.url) } catch (error) { setMessage(error.message) } finally { setBusy(false); event.target.value = '' }
  }
  return <dialog className="media-dialog" ref={dialog} onCancel={onClose}><div className="dialog-head"><div><p className="eyebrow">MEDIA LIBRARY</p><h2>Choose an image</h2></div><button type="button" className="icon-button" aria-label="Close image picker" onClick={onClose}><X/></button></div><label className="button primary upload-button"><Upload size={17}/>{busy ? 'Optimizing and uploading…' : 'Upload new image'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={upload}/></label><Notice error>{error || message}</Notice>{data ? <div className="media-grid compact">{data.map(item => <button key={item._id} type="button" className="media-choice" onClick={() => onSelect(item.url)}><img src={item.url} alt={item.originalName}/><span>{item.originalName}</span></button>)}{!data.length && <p>No uploads yet. Choose an image from your computer.</p>}</div> : <Loading/>}</dialog>
}
export function BackButton({ onClick, children = 'Back' }) { return <button type="button" className="text-button" onClick={onClick}><ArrowLeft size={16}/>{children}</button> }
