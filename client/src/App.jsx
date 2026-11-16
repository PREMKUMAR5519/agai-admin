import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router'
import { ArrowUpRight, BookOpen, CircleHelp, FileText, Image, LayoutDashboard, LogOut, Menu, Settings, X } from 'lucide-react'
import { api, setToken } from './api'
import { Field, Loading, Notice } from './components'
import Dashboard from './pages/Dashboard'
import Journal from './pages/Journal'
import ArticleEditor from './pages/ArticleEditor'
import WebsiteContent from './pages/WebsiteContent'
import Media from './pages/Media'
import SettingsPage from './pages/Settings'

const navigation = [{ to: '/', label: 'Overview', icon: LayoutDashboard, end: true }, { to: '/journal', label: 'Journal', icon: BookOpen }, { to: '/content', label: 'Website content', icon: FileText }, { to: '/media', label: 'Media library', icon: Image }]
function Login({ onLogin }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try { onLogin(await api('/auth/login', { method: 'POST', body: Object.fromEntries(form) })) } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  return <main className="login-page"><section className="login-story"><Link to="/" className="brand light"><img src="/agai-emblem.svg" alt=""/><span>AGAI <b>STUDIO</b></span></Link><div><p className="eyebrow">CARE BEGINS WITH CONNECTION</p><h1>Good care.<br/>Thoughtful words.<br/><em>One place.</em></h1><p>Your space to share knowledge, tell your story, and keep AGAI’s community informed.</p></div><small>AGAI Physiotherapy Centre · Content workspace</small></section><section className="login-form-wrap"><form onSubmit={submit} className="login-form"><span className="login-symbol"><BookOpen/></span><p className="eyebrow">WELCOME TO YOUR WORKSPACE</p><h2>A little care for<br/>your website.</h2><p>Sign in to manage your journal and website content.</p><Notice error>{error}</Notice><Field label="Email address" name="email" type="email" autoComplete="username" required placeholder="you@agaiphysiotherapy.com"/><Field label="Password" name="password" type="password" autoComplete="current-password" required/><button className="button primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to Studio'}<ArrowUpRight size={18}/></button><p className="login-help">First time here? Your local sign-in details are in<br/><code>server/.local/admin-credentials.txt</code></p></form><span className="login-footer">A focused space for the people behind AGAI.</span></section></main>
}
export default function App() {
  const [auth, setAuth] = useState(undefined)
  const [menu, setMenu] = useState(false)
  const [error, setError] = useState('')
  const location = useLocation()
  useEffect(() => { let active = true; api('/auth/me').then(value => { if (active) setAuth(value) }).catch(() => { if (active) setAuth(null) }); return () => { active = false } }, [])
  useEffect(() => { const expired = () => { setAuth(null); setToken('') }; window.addEventListener('session-expired', expired); return () => window.removeEventListener('session-expired', expired) }, [])
  useEffect(() => { setMenu(false) }, [location.pathname])
  if (auth === undefined) return <Loading/>
  if (!auth) return <Login onLogin={setAuth}/>
  async function logout() { try { await api('/auth/logout', { method: 'POST' }); setToken(''); setAuth(null) } catch (error) { setError(error.message) } }
  return <div className="workspace"><a className="skip-link" href="#workspace-main">Skip to content</a>{menu && <button className="menu-scrim" aria-label="Close navigation" onClick={() => setMenu(false)}/>}<aside className={`sidebar ${menu ? 'open' : ''}`}><Link to="/" className="brand"><img src="/agai-emblem.svg" alt=""/><span>AGAI <b>STUDIO</b></span></Link><button className="mobile-close icon-button" onClick={() => setMenu(false)} aria-label="Close navigation"><X/></button><div className="workspace-label"><span className="workspace-dot"/>Physiotherapy Centre<span className="label-small">WORKSPACE</span></div><p className="nav-label">MANAGE</p><nav aria-label="Main navigation">{navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end}><Icon size={19}/>{label}</NavLink>)}</nav><div className="sidebar-bottom"><div className="sidebar-note"><CircleHelp size={19}/><strong>A small update.<br/>A meaningful connection.</strong><p>Keep your community in the know.</p><a href="https://agaiphysiotherapy.com" target="_blank" rel="noreferrer">Visit your website <ArrowUpRight size={15}/></a></div><NavLink className="settings-link" to="/settings"><Settings size={18}/>Settings</NavLink><button className="account" onClick={logout}><span className="avatar">A</span><span><strong>{auth.user.name}</strong><small>Administrator</small></span><LogOut size={17}/></button></div></aside><div className="main-shell"><header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMenu(true)}><Menu/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{location.pathname.startsWith('/journal') ? 'Journal' : location.pathname.startsWith('/content') ? 'Website content' : location.pathname.startsWith('/media') ? 'Media library' : location.pathname.startsWith('/settings') ? 'Settings' : 'Overview'}</strong></div><div className="topbar-right"><span className="connection"><i/>Content studio</span><span className="avatar small">A</span></div></header><main id="workspace-main" className="main-content"><Notice error>{error}</Notice><Routes><Route path="/" element={<Dashboard/>}/><Route path="/journal" element={<Journal/>}/><Route path="/journal/new" element={<ArticleEditor key="new"/>}/><Route path="/journal/:id" element={<ArticleEditor/>}/><Route path="/content" element={<WebsiteContent/>}/><Route path="/media" element={<Media/>}/><Route path="/settings" element={<SettingsPage user={auth.user}/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes><footer className="workspace-footer"><span>AGAI Studio</span><span>Made for thoughtful care.</span></footer></main></div></div>
}
