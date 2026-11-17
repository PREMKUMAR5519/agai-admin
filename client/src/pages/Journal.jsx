import { Link, useLocation, useSearchParams } from 'react-router'
import { ArrowUpRight, Plus, Search } from 'lucide-react'
import { assetUrl, dateLabel, postStatus } from '../api'
import { Badge, Empty, Loading, Notice, PageHead, useResource } from '../components'

export default function Journal() {
  const { state } = useLocation()
  const { data, error } = useResource('/posts')
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || ''
  const filter = ['Published', 'Draft'].includes(params.get('status')) ? params.get('status') : 'All articles'
  const update = (key, value) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next, { replace: true }) }
  const visible = data?.filter(post => (filter === 'All articles' || (!post.archived && (filter === 'Draft' ? !post.published || post.revision !== post.publishedRevision : Boolean(post.published)))) && `${post.draft.title} ${post.draft.category}`.toLowerCase().includes(query.toLowerCase()))
  return <><PageHead eyebrow="THE AGAI JOURNAL" title="Words that move people." description="Helpful reads. Practical insight. Your voice, shared with care."><Link to="/journal/new" className="button primary"><Plus size={17}/>New blog</Link></PageHead><section className="panel"><div className="journal-toolbar"><div className="tabs" role="group" aria-label="Filter articles">{['All articles', 'Published', 'Draft'].map(value => <button key={value} className={value === filter ? 'active' : ''} onClick={() => update('status', value)} aria-pressed={value === filter}>{value === 'Draft' ? 'Drafts & updates' : value}</button>)}</div><label className="search-field"><Search size={17}/><input aria-label="Search articles" placeholder="Find an article…" value={query} onChange={event => update('q', event.target.value)}/></label></div><Notice>{state?.notice}</Notice><Notice error>{error}</Notice>{!data && !error ? <Loading/> : <div className="article-list">{visible?.map(post => <Link className="article-row" to={`/journal/${post._id}`} key={post._id}><div className="article-thumb">{post.draft.image ? <img src={assetUrl(post.draft.image)} alt=""/> : <span>A</span>}</div><div className="article-row-copy"><span className="category-label">{post.draft.category}</span><h2>{post.draft.title}</h2><p>{post.draft.excerpt}</p><small>Updated {dateLabel(post.updatedAt)}</small></div><div className="article-row-status"><Badge status={postStatus(post)}/><span>Edit article <ArrowUpRight size={15}/></span></div></Link>)}{visible?.length === 0 && <Empty title="A little room for something new."><p>No articles match this view.</p><Link to="/journal/new" className="button secondary">Write an article</Link></Empty>}</div>}<div className="list-footer">{visible?.length || 0} articles <span>Your published journal lives at agaiphysiotherapy.com/blogs</span></div></section></>
}
