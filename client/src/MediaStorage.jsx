import { HardDrive, RefreshCw } from 'lucide-react'
import './media-storage.css'

function formatBytes(bytes) {
  if (!bytes) return '0 MB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 2 })} MB`
}

export default function MediaStorage({ data, error, onRefresh }) {
  const percent = data ? Math.min(100, data.usedBytes / data.limitBytes * 100) : 0
  const full = data?.remainingBytes === 0
  const low = percent >= 90
  return <section className={`panel media-storage ${low ? 'storage-low' : ''}`} aria-labelledby="image-storage-title" aria-busy={!data && !error}>
    <header><div className="media-storage-heading"><span className="media-storage-icon"><HardDrive size={21}/></span><div><h2 id="image-storage-title">Image storage</h2><p>Your media library has a total allowance of 300 MB.</p></div></div><button type="button" className="icon-button" aria-label="Refresh image storage" disabled={!data && !error} onClick={onRefresh}><RefreshCw size={17}/></button></header>
    {error ? <div className="storage-error" role="alert"><p>Storage usage could not be loaded.</p><button type="button" className="text-button" onClick={onRefresh}>Retry storage usage</button></div> : !data ? <p className="storage-loading">Loading storage usage…</p> : <>
      <div className="media-storage-stats"><div><span>Used storage</span><strong>{formatBytes(data.usedBytes)}</strong></div><div><span>Available space</span><strong>{formatBytes(data.remainingBytes)}</strong></div><div><span>Total storage</span><strong>{formatBytes(data.limitBytes)}</strong></div></div>
      <progress aria-label="Image storage used" aria-valuetext={`${formatBytes(data.usedBytes)} used out of ${formatBytes(data.limitBytes)}`} value={Math.min(data.usedBytes, data.limitBytes)} max={data.limitBytes}/>
      <div className="media-storage-caption"><span>{data.imageCount} uploaded image{data.imageCount === 1 ? '' : 's'}</span><span>{percent > 0 && percent < 0.1 ? '<0.1' : percent.toFixed(1)}% used</span></div>
      {low && <p className="storage-warning">{full ? 'Your image storage is full. Delete unused images to make room for new uploads.' : 'Your image storage is almost full. Delete unused images or upload smaller files.'}</p>}
      <p className="media-storage-help">Based on saved, optimized images. Reusing an image does not use extra space.</p>
    </>}
  </section>
}
