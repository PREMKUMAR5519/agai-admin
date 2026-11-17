import { useEffect, useRef, useState } from 'react'

let scriptPromise
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const fail = () => {
      clearTimeout(timer); script.remove(); scriptPromise = undefined
      reject(new Error('Security verification could not load. Check your connection and try again.'))
    }
    const timer = setTimeout(fail, 15000)
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => {
      if (!window.turnstile) return fail()
      clearTimeout(timer); resolve(window.turnstile)
    }
    script.onerror = fail
    document.head.appendChild(script)
  })
  return scriptPromise
}

export default function Turnstile({ siteKey, onToken }) {
  const container = useRef(null)
  const [attempt, setAttempt] = useState(0)
  const [message, setMessage] = useState('Loading security verification…')
  const [failed, setFailed] = useState(false)
  const [size, setSize] = useState('compact')
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize(entry.contentRect.width >= 300 ? 'flexible' : 'compact'))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let active = true
    let widget
    onToken(''); setFailed(false); setMessage('Loading security verification…')
    const fail = message => {
      if (!active) return
      onToken(''); setFailed(true); setMessage(message)
    }
    loadTurnstile().then(api => {
      if (!active) return
      setMessage('Complete the security verification.')
      widget = api.render(container.current, {
        sitekey: siteKey, action: 'admin-login', theme: 'light', size,
        'response-field': false, 'refresh-expired': 'manual',
        callback: token => { if (active) { onToken(token); setFailed(false); setMessage('Security verification complete.') } },
        'expired-callback': () => fail('Verification expired. Please verify again.'),
        'timeout-callback': () => fail('Verification timed out. Please try again.'),
        'error-callback': () => { fail('Security verification failed. Please try again.'); return true },
        'unsupported-callback': () => fail('This browser cannot complete verification. Try an updated browser.'),
      })
    }).catch(() => fail('Security verification could not load. Check your connection and try again.'))
    return () => {
      active = false
      if (widget !== undefined) window.turnstile?.remove(widget)
    }
  }, [siteKey, onToken, attempt, size])
  return <div className="login-verification"><div ref={container}/><p role={failed ? 'alert' : 'status'}>{message}</p>{failed && <button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>Retry verification</button>}</div>
}
