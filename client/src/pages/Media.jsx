import { uploadImage } from '../image-upload'
import { useEffect, useRef, useState } from 'react'
import { Copy, Trash2, Upload } from 'lucide-react'
import { api, dateLabel } from '../api'
import { Empty, Loading, Notice, PageHead, useResource } from '../components'
import MediaStorage from '../MediaStorage'
import DeleteMediaDialog from '../DeleteMediaDialog'
import '../media-library.css'

export default function Media() {
  const { data, setData, error, reload } = useResource('/media')
  const storage = useResource('/media/storage')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletedId, setDeletedId] = useState('')
  const uploadInput = useRef(null)
  useEffect(() => { if (deletedId) uploadInput.current?.focus() }, [deletedId])
  async function upload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true); setFailure(''); setMessage('')
    try { const result = await uploadImage(file); setData(items => [result, ...(items || [])]); setMessage('Image uploaded and ready to use.') } catch (error) { setFailure(error.message) } finally { setBusy(false); event.target.value = ''; storage.reload() }
  }
  async function copy(url) { try { await navigator.clipboard.writeText(url); setMessage('Image URL copied.') } catch { setFailure('Clipboard unavailable. Select and copy the image URL below.') } }
  async function removeImage(password) {
    const target = deleteTarget
    await api(`/media/${target._id}`, { method: 'DELETE', body: { password } })
    setData(items => items?.filter(item => item._id !== target._id) || [])
    setDeleteTarget(null); setFailure(''); setDeletedId(target._id)
    setMessage('Image permanently deleted. Its storage space is now available.')
    storage.reload()
  }
  return <>
    <PageHead eyebrow="A LITTLE VISUAL INSPIRATION" title="Room for your imagery." description="Upload, reuse, and manage your website images.">
      <label className="button primary upload-button"><Upload size={17}/>{busy ? 'Optimizing and uploading…' : 'Upload image'}<input ref={uploadInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy || !!deleteTarget || storage.data?.remainingBytes === 0}/></label>
    </PageHead>
    <Notice error>{error || failure}</Notice><Notice>{message}</Notice>
    {error && <button type="button" className="button secondary" onClick={reload}>Retry loading images</button>}
    <MediaStorage data={storage.data} error={storage.error} onRefresh={storage.reload}/>
    <div className="upload-note"><Upload size={19}/><p>JPEG, PNG or WebP · Up to 20 MB<span>Automatically resized and saved as WebP, up to 250 KB per image.</span></p></div>
    {!data && !error ? <Loading/> : data?.length ? <div className="media-grid">{data.map(item => <article className="panel media-card" key={item._id}>
      <img src={item.url} alt={item.originalName}/><div><h3>{item.originalName}</h3><p>{item.width} × {item.height} · {Math.round(item.size / 1024)} KB</p><small>{dateLabel(item.createdAt)}</small>
        <label className="sr-only" htmlFor={`media-${item._id}`}>Image URL for {item.originalName}</label><input id={`media-${item._id}`} className="media-url" value={item.url} readOnly onFocus={event => event.target.select()}/>
        <div className="media-card-actions"><button type="button" className="text-button" onClick={() => copy(item.url)}><Copy size={14}/>Copy image URL</button><button type="button" className="text-button media-delete-button" aria-label={`Delete image ${item.originalName}`} disabled={busy} onClick={() => { setMessage(''); setFailure(''); setDeleteTarget(item) }}><Trash2 size={15}/>Delete</button></div>
      </div>
    </article>)}</div> : !error && <section className="panel"><Empty title="Your next story deserves a good image."><p>Upload your first image to start building the library.</p></Empty></section>}
    {deleteTarget && <DeleteMediaDialog image={deleteTarget} onDelete={removeImage} onClose={() => setDeleteTarget(null)}/>}
  </>
}
