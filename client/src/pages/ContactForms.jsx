import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Search, X, ArrowUpRight } from 'lucide-react'
import { Empty, Loading, Notice, PageHead, useResource } from '../components'
import { api } from '../api'
import './ContactForms.css'

const dateLabel = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const mailLabels = { pending: 'Pending', sending: 'Sending', sent: 'Accepted by Gmail', failed: 'Needs retry', not_configured: 'Not configured', not_requested: 'Earlier enquiry' }
function EnquiryDialog({ item, onClose, emailConfigured, onUpdate }) {
  const dialog = useRef(null)
  const [notification, setNotification] = useState(item.emailNotification || { status: 'not_requested' })
  const [mailBusy, setMailBusy] = useState(false)
  const [mailError, setMailError] = useState('')
  async function retryNotification() {
    setMailBusy(true)
    setMailError('')
    try {
      const result = await api(`/contact-submissions/${item._id}/notification`, { method: 'POST' })
      setNotification(result.notification)
      onUpdate()
    } catch (error) { setMailError(error.message) }
    finally { setMailBusy(false) }
  }
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement
    element.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  return <dialog ref={dialog} className="contact-dialog" aria-labelledby="enquiry-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="contact-dialog-content"><header><div><p className="eyebrow">CONTACT ENQUIRY</p><h2 id="enquiry-title">{item.name}</h2></div><button type="button" className="icon-button" aria-label="Close enquiry" onClick={onClose} autoFocus><X size={20}/></button></header>
      <dl><div><dt>Phone number</dt><dd><a href={`tel:${item.phone.replace(/[^+\d]/g, '')}`}>{item.phone}</a></dd></div><div><dt>Email address</dt><dd>{item.email ? <a href={`mailto:${item.email}`}>{item.email}</a> : 'Not provided'}</dd></div><div><dt>Service</dt><dd>{item.service}</dd></div><div><dt>Received</dt><dd><time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time></dd></div></dl>
      <section className="contact-message-section"><h3>Message</h3><p className="contact-message">{item.message}</p></section>
      <section className="contact-notification" aria-label="Email notification">
        <h3>Email notification</h3><p role="status">{mailLabels[notification.status] || 'Pending'}{notification.sentAt ? ` · ${dateLabel(notification.sentAt)}` : ''}</p>
        <p className="contact-notification-note">Notifications go to agaiphysiorehab@gmail.com. The enquiry remains saved here.</p>
        {notification.status === 'failed' && <p className="contact-notification-note">{notification.errorCode === 'EAUTH' ? 'Gmail rejected the sign-in. Check the server app password before retrying.' : 'The email attempt failed. Wait one minute, then retry.'}</p>}
        {notification.status === 'sending' && <p className="contact-notification-note">An attempt is in progress. Wait a moment before checking again.</p>}
        <Notice error>{mailError}</Notice>
        {!['sent', 'not_requested'].includes(notification.status) && <button type="button" className="button" disabled={mailBusy || !emailConfigured} onClick={retryNotification}>{mailBusy ? 'Sending…' : notification.status === 'sending' ? 'Check / retry notification' : 'Retry email notification'}</button>}
      </section>
      <footer><small>Reference: {item._id}</small><button type="button" className="button" onClick={onClose}>Close</button></footer>
    </div>
  </dialog>
}
export default function ContactForms() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({ search: '', page: 1 })
  const [selected, setSelected] = useState(null)
  useEffect(() => {
    const timer = setTimeout(() => setQuery(current => current.search === search.trim() ? current : { search: search.trim(), page: 1 }), 300)
    return () => clearTimeout(timer)
  }, [search])
  const { data, error, reload } = useResource(`/contact-submissions?page=${query.page}&search=${encodeURIComponent(query.search)}`)
  const pending = search.trim() !== query.search
  return <section className="contact-inbox">
    <PageHead eyebrow="WEBSITE ENQUIRIES" title="Contact forms" description="View and respond to messages from your website."><button className="button" onClick={reload}><RefreshCw size={16}/>Refresh</button></PageHead>
    {data?.emailConfigured === false && <Notice error>Email notifications are not configured. Add the Gmail app password to the admin server environment and restart or redeploy it. Enquiries are still saved below.</Notice>}
    <div className="contact-table-panel"><div className="contact-toolbar"><div><h2>All enquiries</h2><p>Select an enquiry to view the full message.</p></div><div className="contact-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label="Search enquiries" placeholder="Search name, phone or email…" maxLength={200} value={search} onChange={event => setSearch(event.target.value)}/>{search && <button type="button" className="icon-button" aria-label="Clear search" onClick={() => setSearch('')}><X size={16}/></button>}</div></div>
      <div aria-busy={pending || !data && !error}>{error ? <div className="contact-feedback"><Notice error>{error}</Notice><button className="button" onClick={reload}>Try again</button></div> : !data || pending ? <Loading/> : <>
        {!data.items.length ? <Empty title={query.search ? 'No matching enquiries' : 'No enquiries yet'}><p>{query.search ? 'Try another name, phone number or email address.' : 'Contact form submissions will appear here.'}</p>{query.search && <button className="button" onClick={() => setSearch('')}>Clear search</button>}</Empty> : <div className="contact-table-scroll" role="region" aria-label="Enquiries table" tabIndex={0}><table className="contact-table"><thead><tr><th scope="col">Name</th><th scope="col">Phone</th><th scope="col">Email</th><th scope="col">Received</th><th scope="col"><span className="contact-sr-only">Details</span></th></tr></thead><tbody>{data.items.map(item => <tr key={item._id} onClick={() => setSelected(item)}><td><button type="button" className="contact-open" onClick={event => { event.stopPropagation(); setSelected(item) }} aria-label={`View enquiry from ${item.name}`}>{item.name}</button><span className="contact-service">{item.service}</span></td><td>{item.phone}</td><td>{item.email || <span className="contact-muted">Not provided</span>}</td><td><time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time></td><td><ArrowUpRight size={17} aria-hidden="true"/></td></tr>)}</tbody></table></div>}
        <div className="contact-table-footer"><p role="status">{data.total ? `${(query.page - 1) * data.pageSize + 1}–${Math.min(query.page * data.pageSize, data.total)} of ${data.total} enquiries` : '0 enquiries'}{query.search ? ' matching your search' : ''}</p>{data.total > data.pageSize && <nav className="contact-pagination" aria-label="Enquiry pages"><button className="button" disabled={query.page === 1} onClick={() => setQuery(current => ({ ...current, page: current.page - 1 }))}>Previous</button><span>Page {query.page} of {Math.ceil(data.total / data.pageSize)}</span><button className="button" disabled={query.page * data.pageSize >= data.total} onClick={() => setQuery(current => ({ ...current, page: current.page + 1 }))}>Next</button></nav>}</div>
      </>}</div>
    </div>{selected && <EnquiryDialog item={selected} emailConfigured={data?.emailConfigured} onUpdate={reload} onClose={() => setSelected(null)}/>}
  </section>
}
