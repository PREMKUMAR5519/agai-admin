import { useEffect, useId, useRef, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Field, Notice } from './components'

export default function DeleteServiceDialog({ service, hasUnsavedChanges, onDelete, onClose }) {
  const dialog = useRef(null)
  const titleId = useId()
  const descriptionId = useId()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try { await onDelete(password) }
    catch (error) { setError(error.message); setPassword(''); setBusy(false) }
  }

  return <dialog ref={dialog} className="media-dialog service-delete-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="dialog-head"><h2 id={titleId}>Delete service?</h2><button className="text-button" type="button" aria-label="Close delete service dialog" disabled={busy} onClick={onClose}><X size={20}/></button></div>
    <p id={descriptionId}>Permanently delete <strong>{service.title || service.shortTitle}</strong> from the database and published website content? This cannot be undone.</p>
    {hasUnsavedChanges && <p className="muted">Unsaved edits to this service will be discarded. Your edits to other services will be kept.</p>}
    <form onSubmit={submit}>
      <Field label="Admin password" type="password" autoComplete="current-password" autoFocus required maxLength={256} value={password} disabled={busy} onChange={event => { setPassword(event.target.value); setError('') }} hint="Enter the password for your signed-in admin account."/>
      <Notice error>{error}</Notice>
      <div className="service-delete-actions"><button className="button secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="button service-delete-confirm" type="submit" disabled={busy || !password}><Trash2 size={16}/>{busy ? 'Deleting…' : 'Delete service permanently'}</button></div>
    </form>
  </dialog>
}
