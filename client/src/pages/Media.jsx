import { uploadImage } from '../image-upload'
import { useState } from 'react'
import { Copy, Upload } from 'lucide-react'
import { dateLabel } from '../api'
import { Empty, Loading, Notice, PageHead, useResource } from '../components'

export default function Media() {
  const { data, setData, error } = useResource('/media')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')
  async function upload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true); setFailure(''); setMessage('')
    try { const result = await uploadImage(file); setData(items => [result, ...(items || [])]); setMessage('Image uploaded and ready to use.') } catch (error) { setFailure(error.message) } finally { setBusy(false); event.target.value = '' }
  }
  async function copy(url) { try { await navigator.clipboard.writeText(url); setMessage('Image URL copied.') } catch { setFailure('Clipboard unavailable. Select and copy the image URL below.') } }
  return <><PageHead eyebrow="A LITTLE VISUAL INSPIRATION" title="Room for your imagery." description="Choose images that tell your story with care."><label className="button primary upload-button"><Upload size={17}/>{busy ? 'Optimizing and uploading…' : 'Upload image'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy}/></label></PageHead><Notice error>{error || failure}</Notice><Notice>{message}</Notice><div className="upload-note"><Upload size={19}/><p>JPEG, PNG or WebP · Up to 20 MB<span>Automatically resized and saved as WebP, up to 512 KB per image.</span></p></div>{!data && !error ? <Loading/> : data?.length ? <div className="media-grid">{data.map(item => <article className="panel media-card" key={item._id}><img src={item.url} alt={item.originalName}/><div><h3>{item.originalName}</h3><p>{item.width} × {item.height} · {Math.round(item.size / 1024)} KB</p><small>{dateLabel(item.createdAt)}</small><label className="sr-only" htmlFor={`media-${item._id}`}>Image URL for {item.originalName}</label><input id={`media-${item._id}`} className="media-url" value={item.url} readOnly onFocus={event => event.target.select()}/><button className="text-button" onClick={() => copy(item.url)}><Copy size={14}/>Copy image URL</button></div></article>)}</div> : <section className="panel"><Empty title="Your next story deserves a good image."><p>Upload your first image to start building the library.</p></Empty></section>}</>
}
