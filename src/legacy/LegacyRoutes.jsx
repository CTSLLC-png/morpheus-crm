// src/legacy/LegacyRoutes.jsx
// ── Legacy Path — routes for legacy.morpheuscr.com (base "") and the
//    /legacy/* preview path on the main Morpheus domain (base "/legacy").
//    The public landing page and the Privacy/Terms/Refunds pages are static
//    HTML in /public (served by Vercel), so reviewers and search engines see
//    them without JavaScript. This SPA handles sign-in, the app and checkout.

import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import './legacy.css'
import { mountLegacy } from './ui.js'
import {
  supabase, hasAccess, loadContent, loadIntake, saveIntake, startCheckout,
  signUp, signInWithPassword, sendReset,
} from './api.js'

const AdminContent  = lazy(() => import('./AdminContent.jsx'))
const ResetPassword = lazy(() => import('../pages/ResetPassword.jsx'))

const FONTS = 'https://fonts.googleapis.com/css2?family=Spectral:wght@500;600;700&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap'

function useFonts() {
  useEffect(() => {
    if (document.getElementById('lp-fonts')) return
    const l = document.createElement('link')
    l.id = 'lp-fonts'; l.rel = 'stylesheet'; l.href = FONTS
    document.head.appendChild(l)
  }, [])
}

function useLegacySession() {
  const [state, setState] = useState({ loading: true, session: null })
  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => alive && setState({ loading: false, session: data.session }))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => alive && setState({ loading: false, session }))
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])
  return state
}

function Frame({ base, children, narrow = true }) {
  return (
    <div className="lp-app">
      <header className="topbar">
        <a className="brand" href={`${base}/`} style={{ color: 'inherit', textDecoration: 'none' }}>
          <span>Legacy Path<small>Certified Training Standards</small></span>
        </a>
        <div className="spacer" />
      </header>
      <main style={{ maxWidth: narrow ? 520 : 960, margin: '0 auto', padding: '32px 16px 48px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {children}
      </main>
      <footer style={{ maxWidth: 960, margin: '0 auto', padding: '0 16px 32px', fontSize: '.82rem', color: 'var(--muted)' }}>
        © 2026 Certified Training Standards LLC · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/refunds">Refunds</a>
      </footer>
    </div>
  )
}

function Loading({ base, text = 'Loading…' }) {
  return <Frame base={base}><p className="muted" role="status">{text}</p></Frame>
}

// ── Sign in / create account ──────────────────────────────────────────────
function SignIn({ base }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') === 'unlock' ? 'unlock' : 'app'
  const [mode, setMode] = useState(params.get('mode') === 'signin' ? 'signin' : 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const { session } = useLegacySession()

  useEffect(() => { if (session) navigate(`${base}/app${next === 'unlock' ? '?unlock=1' : ''}`, { replace: true }) }, [session])

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(null); setMsg(null)
    try {
      const appUrl = `${window.location.origin}${base}/app${next === 'unlock' ? '?unlock=1' : ''}`
      if (mode === 'signup') {
        const data = await signUp(email.trim(), password, appUrl)
        if (!data.session) setMsg(`We sent a confirmation link to ${email.trim()}. Open it to finish creating your account.`)
      } else if (mode === 'signin') {
        await signInWithPassword(email.trim(), password)
      } else {
        await sendReset(email.trim(), `${window.location.origin}${base}/reset-password`)
        setMsg('If that email has an account, a reset link is on its way.')
      }
    } catch (e2) {
      setErr(e2.message || 'Something went wrong. Please try again.')
    } finally { setBusy(false) }
  }

  const title = mode === 'signup' ? 'Create your free account' : mode === 'signin' ? 'Sign in to Legacy Path' : 'Reset your password'
  return (
    <Frame base={base}>
      <div className="pagehead">
        <div className="eyebrow">Legacy Path</div>
        <h1>{title}</h1>
        {mode === 'signup' && <p>Take the family screener free. Unlock every guide for a one-time $20 whenever you&apos;re ready.</p>}
      </div>
      <form className="card" onSubmit={submit} style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="lp-email">Email</label>
          <input id="lp-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== 'reset' && (
          <div className="field">
            <label htmlFor="lp-password">Password</label>
            <input id="lp-password" type="password" required minLength={8}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === 'signup' && <span className="help">At least 8 characters.</span>}
          </div>
        )}
        {err && <p role="alert" style={{ color: 'var(--crit)' }}>{err}</p>}
        {msg && <p role="status" className="notice">{msg}</p>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'signin' ? 'Sign in' : 'Send reset link'}
        </button>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '.9rem' }}>
          {mode !== 'signin' && <button type="button" className="btn small" onClick={() => setMode('signin')}>I already have an account</button>}
          {mode !== 'signup' && <button type="button" className="btn small" onClick={() => setMode('signup')}>Create an account</button>}
          {mode === 'signin' && <button type="button" className="btn small" onClick={() => setMode('reset')}>Forgot password?</button>}
        </div>
      </form>
      <p className="muted" style={{ fontSize: '.85rem' }}>
        By creating an account you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.
        Legacy Path is education only, not financial, insurance, tax or legal advice.
      </p>
    </Frame>
  )
}

// ── The app ───────────────────────────────────────────────────────────────
function AppPage({ base }) {
  const { loading, session } = useLegacySession()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [banner, setBanner] = useState(null)
  const hostRef = useRef(null)
  const uid = session?.user?.id

  useEffect(() => {
    if (!uid) return
    let alive = true
    ;(async () => {
      try {
        const access = await hasAccess(uid)
        const [content, intake] = await Promise.all([access ? loadContent() : Promise.resolve(null), loadIntake(uid)])
        if (alive) setData({ access, content, intake })
      } catch (e) {
        if (alive) setBanner('We could not load your account. Refresh the page to try again.')
      }
    })()
    return () => { alive = false }
  }, [uid])

  async function unlock() {
    setBanner('Opening secure checkout…')
    try {
      const r = await startCheckout()
      if (r === 'already_purchased') { setBanner('You already have lifetime access. Refreshing…'); window.location.reload() }
      else if (r === 'signed_out') { setBanner('Please sign in again to continue.') }
    } catch (e) { setBanner(e.message) }
  }

  // Coming from "Get lifetime access" on the landing page.
  useEffect(() => {
    if (data && !data.access && params.get('unlock') === '1') { setParams({}, { replace: true }); unlock() }
  }, [data])

  useEffect(() => {
    if (!data || !hostRef.current) return
    return mountLegacy(hostRef.current, {
      content: data.content,
      hasAccess: data.access,
      initialIntake: data.intake,
      email: session?.user?.email,
      homeHref: `${base}/`,
      onUnlock: unlock,
      onSaveIntake: (d) => saveIntake(uid, d).catch(() => setBanner('Your answers could not be saved. Check your connection and retake the screener.')),
      onSignOut: async () => { await supabase.auth.signOut(); window.location.assign(`${base}/`) },
    })
  }, [data])

  if (loading) return <Loading base={base} />
  if (!session) return <Navigate to={`${base}/signin`} replace />
  return (
    <>
      {banner && (
        <div role="status" style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 50, background: '#1C3D35', color: '#fff', padding: '12px 16px', borderRadius: 10, maxWidth: 560, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
          {banner} <button onClick={() => setBanner(null)} style={{ marginLeft: 8, background: 'transparent', color: '#fff', border: '1px solid #fff6', borderRadius: 6, padding: '2px 8px' }}>Dismiss</button>
        </div>
      )}
      {!data ? <Loading base={base} /> : <div ref={hostRef} className="lp-app" />}
    </>
  )
}

// ── After Stripe Checkout ─────────────────────────────────────────────────
function PurchaseSuccess({ base }) {
  const { loading, session } = useLegacySession()
  const [status, setStatus] = useState('checking')
  useEffect(() => {
    if (!session) return
    let tries = 0, alive = true
    const tick = async () => {
      try {
        if (await hasAccess(session.user.id)) { alive && setStatus('ready'); return }
      } catch { /* retry */ }
      if (++tries < 15 && alive) setTimeout(tick, 2000); else alive && setStatus('slow')
    }
    tick()
    return () => { alive = false }
  }, [session])
  if (loading) return <Loading base={base} />
  if (!session) return <Navigate to={`${base}/signin?mode=signin`} replace />
  return (
    <Frame base={base}>
      <div className="pagehead">
        <div className="eyebrow">Payment received</div>
        <h1>{status === 'ready' ? 'Welcome to Legacy Path' : 'Finishing your purchase…'}</h1>
        <p>
          {status === 'checking' && 'Stripe is confirming your payment. This usually takes a few seconds.'}
          {status === 'ready' && 'Your lifetime access is active. Stripe emailed your receipt.'}
          {status === 'slow' && 'Your payment is still being confirmed. Stripe emailed your receipt; access unlocks automatically as soon as confirmation arrives. Try opening the app again in a minute.'}
        </p>
      </div>
      <a className="btn primary" href={`${base}/app#plan`}>Open my family plan</a>
    </Frame>
  )
}

function PurchaseCancel({ base }) {
  return (
    <Frame base={base}>
      <div className="pagehead">
        <div className="eyebrow">Checkout canceled</div>
        <h1>No charge was made</h1>
        <p>You can keep using the free screener and unlock the full guides any time.</p>
      </div>
      <a className="btn primary" href={`${base}/app`}>Back to Legacy Path</a>
    </Frame>
  )
}

function NotFound({ base }) {
  return (
    <Frame base={base}>
      <div className="pagehead"><div className="eyebrow">Page not found</div><h1>We couldn&apos;t find that page</h1>
        <p>The link may be out of date.</p></div>
      <a className="btn primary" href={`${base}/`}>Go to Legacy Path</a>
    </Frame>
  )
}

export default function LegacyRoutes({ base = '' }) {
  useFonts()
  useEffect(() => { document.title = 'Legacy Path — Family wealth education, cradle to grave' }, [])
  return (
    <Suspense fallback={<Loading base={base} />}>
      <Routes>
        <Route index element={<Navigate to="app" replace />} />
        <Route path="app" element={<AppPage base={base} />} />
        <Route path="signin" element={<SignIn base={base} />} />
        <Route path="purchase/success" element={<PurchaseSuccess base={base} />} />
        <Route path="purchase/cancel" element={<PurchaseCancel base={base} />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="admin/content" element={<AdminContent base={base} Frame={Frame} />} />
        <Route path="*" element={<NotFound base={base} />} />
      </Routes>
    </Suspense>
  )
}
