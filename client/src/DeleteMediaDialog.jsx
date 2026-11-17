import { useEffect, useId, useRef, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Field, Notice } from './components'

export default function DeleteMediaDialog({ image, onDelete, onClose }) {
  const dialog = useRef(null)
  const passwordInput = useRef(null)
  const titleId = useId()
  const descriptionId = useId()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    passwordInput.current?.focus()
    return () => element.close()
  }, [])
  useEffect(() => { if (error) passwordInput.current?.focus() }, [error])

  function close() {
    if (busy) return
    dialog.current?.close()
    onClose()
  }

  async function submit(event) {
    event.preventDefault()
    if (busy || !password) return
    setBusy(true); setError('')
    try { await onDelete(password) }
    catch (error) { setPassword(''); setBusy(false); setError(error.message) }
  }

  return <dialog ref={dialog} className="media-dialog media-delete-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); close() }}>
    <div className="dialog-head"><h2 id={titleId}>Delete image?</h2><button type="button" className="icon-button" aria-label="Close delete image dialog" disabled={busy} onClick={close}><X size={20}/></button></div>
    <div className="media-delete-preview"><img src={image.url} alt=""/><strong>{image.originalName}</strong></div>
    <p id={descriptionId}>This permanently removes the image from your library and storage. It cannot be undone.</p>
    <p className="media-delete-warning">If this image is used in a blog or on the website, deleting it will leave a missing image there. Replace it in your content first if needed.</p>
    <form onSubmit={submit}>
      <Field ref={passwordInput} label="Admin password" type="password" autoComplete="current-password" required maxLength={256} value={password} disabled={busy} onChange={event => { setPassword(event.target.value); setError('') }} hint="Enter the password for your signed-in admin account."/>
      <Notice error>{error}</Notice>
      <div className="media-delete-actions"><button className="button secondary" type="button" disabled={busy} onClick={close}>Cancel</button><button className="button media-delete-confirm" type="submit" disabled={busy || !password}><Trash2 size={16}/>{busy ? 'Deleting…' : 'Delete image permanently'}</button></div>
    </form>
  </dialog>
}
