import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router'
import { ArrowUpRight, BookOpen, CircleHelp, Eye, EyeOff, FileText, Image, LayoutDashboard, LogOut, Menu, Settings, X } from 'lucide-react'
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
  const [showPassword, setShowPassword] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try { onLogin(await api('/auth/login', { method: 'POST', body: Object.fromEntries(form) })) } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  return (
    <main className="login-page">
      <form onSubmit={submit} className="login-form" aria-labelledby="login-heading" aria-busy={busy}>
        <img className="login-logo" src="/agai-emblem.svg" alt="AGAI"/>
        <h1 id="login-heading">Admin login</h1>
        <Notice error>{error}</Notice>
        <Field label="Email address" name="email" type="email" autoComplete="username" required placeholder="you@example.com" disabled={busy}/>
        <div className="field">
          <label className="field-label" htmlFor="login-password">Password</label>
          <div className="login-password-control">
            <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required disabled={busy}/>
            <button type="button" className="login-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-controls="login-password" disabled={busy} onClick={() => setShowPassword(value => !value)}>
              {showPassword ? <EyeOff size={20} aria-hidden="true"/> : <Eye size={20} aria-hidden="true"/>}
            </button>
          </div>
        </div>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Signing in...'  : 'Sign in'}</button>
      </form>
    </main>
  )
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
  return <div className="workspace"><a className="skip-link" href="#workspace-main">Skip to content</a>{menu && <button className="menu-scrim" aria-label="Close navigation" onClick={() => setMenu(false)}/>}<aside className={`sidebar ${menu ? 'open' : ''}`}><Link to="/" className="brand"><img src="/agai-emblem.svg" alt=""/><span>AGAI <b>CMS</b></span></Link><button className="mobile-close icon-button" onClick={() => setMenu(false)} aria-label="Close navigation"><X/></button><p className="nav-label">MANAGE</p><nav aria-label="Main navigation">{navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end}><Icon size={19}/>{label}</NavLink>)}</nav><div className="sidebar-bottom"><div className="sidebar-note"><CircleHelp size={19}/><strong>A small update.<br/>A meaningful connection.</strong><p>Keep your community in the know.</p><a href="https://agaiphysiotherapy.com" target="_blank" rel="noreferrer">Visit your website <ArrowUpRight size={15}/></a></div><NavLink className="settings-link" to="/settings"><Settings size={18}/>Settings</NavLink><button className="account" onClick={logout}><span className="avatar">A</span><span><strong>{auth.user.name}</strong><small>Administrator</small></span><LogOut size={17}/></button></div></aside><div className="main-shell"><header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMenu(true)}><Menu/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{location.pathname.startsWith('/journal') ? 'Journal' : location.pathname.startsWith('/content') ? 'Website content' : location.pathname.startsWith('/media') ? 'Media library' : location.pathname.startsWith('/settings') ? 'Settings' : 'Overview'}</strong></div><div className="topbar-right"><span className="connection"><i/>Content CMS</span><span className="avatar small">A</span></div></header><main id="workspace-main" className="main-content"><Notice error>{error}</Notice><Routes><Route path="/" element={<Dashboard/>}/><Route path="/journal" element={<Journal/>}/><Route path="/journal/new" element={<ArticleEditor key="new"/>}/><Route path="/journal/:id" element={<ArticleEditor/>}/><Route path="/content" element={<WebsiteContent/>}/><Route path="/media" element={<Media/>}/><Route path="/settings" element={<SettingsPage user={auth.user}/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes><footer className="workspace-footer"><span>AGAI CMS</span><span>Made for thoughtful care.</span></footer></main></div></div>
}
