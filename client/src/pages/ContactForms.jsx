import { useState } from 'react'
import { RefreshCw, Mail } from 'lucide-react'
import { Empty, Loading, Notice, PageHead, useResource } from '../components'
import './ContactForms.css'

export default function ContactForms() {
  const [page, setPage] = useState(1)
  const { data, error, reload } = useResource(`/contact-submissions?page=${page}`)
  return <section className="contact-inbox">
    <PageHead eyebrow="WEBSITE ENQUIRIES" title="Contact forms" description="Messages submitted through your website’s Contact us page.">
      <button className="button" onClick={reload}><RefreshCw size={16}/>Refresh</button>
    </PageHead>
    {error ? <><Notice error>{error}</Notice><button className="button" onClick={reload}>Try again</button></> : !data ? <Loading/> : <>
      <p className="contact-total"><Mail size={18}/>{data.total} {data.total === 1 ? 'enquiry' : 'enquiries'} received · Newest first</p>
      {!data.items.length ? <Empty title="No enquiries here yet"><p>New contact form submissions will appear here.</p></Empty> : <div className="contact-entries">{data.items.map(item => <article className="contact-entry" key={item._id}>
        <header><div><h2>{item.name}</h2><p>{item.service}</p></div><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></header>
        <dl><div><dt>Phone</dt><dd><a href={`tel:${item.phone.replace(/[^+\d]/g, '')}`}>{item.phone}</a></dd></div><div><dt>Email</dt><dd>{item.email ? <a href={`mailto:${item.email}`}>{item.email}</a> : 'Not provided'}</dd></div></dl>
        <details><summary>Read message</summary><p className="contact-message">{item.message}</p><small>Reference: {item._id}</small></details>
      </article>)}</div>}
      {data.total > data.pageSize && <nav className="contact-pagination" aria-label="Enquiry pages"><button className="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span><button className="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>Next</button></nav>}
    </>}
  </section>
}
