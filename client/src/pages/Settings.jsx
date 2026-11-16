import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { api } from '../api'
import { Field, Notice, PageHead } from '../components'

export default function Settings({ user }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function changePassword(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); setError(''); setNotice('')
    if (values.newPassword !== values.confirmPassword) { setError('The new passwords do not match.'); return }
    setBusy(true)
    try { await api('/auth/password', { method: 'POST', body: { currentPassword: values.currentPassword, newPassword: values.newPassword } }); form.reset(); setNotice('Password updated. Other sessions have been signed out.') } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  return <><PageHead eyebrow="YOUR WORKSPACE ESSENTIALS" title="A space that’s yours." description="Manage your account and understand how publishing works."/><div className="settings-grid"><section className="panel form-panel"><p className="eyebrow">YOUR ACCOUNT</p><h2>Keep your account secure.</h2><p className="muted">Signed in as {user.email}</p><Notice error>{error}</Notice><Notice>{notice}</Notice><form onSubmit={changePassword}><Field label="Current password" type="password" name="currentPassword" autoComplete="current-password" required/><Field label="New password" type="password" name="newPassword" autoComplete="new-password" required minLength={12} maxLength={128} hint="Use at least 12 characters."/><Field label="Confirm new password" type="password" name="confirmPassword" autoComplete="new-password" required minLength={12}/><button className="button primary" disabled={busy}><KeyRound size={16}/>{busy ? 'Updating…' : 'Update password'}</button></form></section><section className="panel form-panel publishing-guide"><p className="eyebrow">FROM CMS TO WEBSITE</p><h2>Publish with confidence.</h2><ol><li><strong>Make it yours.</strong><p>Edit a journal article or your website’s main content. Preview articles before sharing.</p></li><li><strong>Save a draft.</strong><p>Your work is saved privately. Visitors continue to see the last published version.</p></li><li><strong>Publish when you’re ready.</strong><p>Publishing updates the public content API. A connected website loads these changes on its next page load.</p></li><li><strong>Keep search up to date.</strong><p>Rebuild and deploy the public website after adding, renaming, or unpublishing articles. The build refreshes its content backup and sitemap.</p></li></ol><div className="editor-tip"><strong>Local workspace</strong><p>This installation uses your local MongoDB. Live visitors need a hosted HTTPS API; localhost is available only on this computer. Deployment steps are in the project README.</p></div></section></div></>
}
