// src/pages/Register.jsx
// ── Morpheus CRM — participant self-registration ────────────────
//
// Email + password, gated by a cohort enrolment code. The registered email IS
// the username; there is no separate handle.
//
// THE TWO-STEP PROBLEM
//
// Registration is two operations that cannot be one transaction: creating the
// auth user (Supabase Auth) and redeeming the code (Postgres). The second can
// fail after the first has succeeded — wrong code, expired code, network drop
// — and that leaves a real, signed-in account with no participant row and no
// cohort.
//
// What we do about it:
//   * We do NOT try to delete the account. The browser holds the anon key and
//     cannot; pretending otherwise would just mean a silent failure.
//   * We do NOT sign the user out and send them to /login. They would sign
//     back in, still have no participant row, and bounce straight back out.
//   * We DO keep them signed in and hand them to /enrol, a screen whose only
//     content is "enter your enrolment code". They can retry there, or on any
//     later sign-in, without staff intervention. Until they succeed that
//     screen is the only thing the account can reach.
//
// So a half-finished registration is a recoverable state with an obvious next
// action, not an orphan.

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase, signUp } from '../lib/supabase.js'
import { redeemCohortInvite } from '../lib/identity.js'
import { normaliseCode, CODE_SHAPE } from '../lib/access.js'
import { useAuth } from '../hooks/useAuth.jsx'

const MIN_PASSWORD = 8

export default function Register() {
  const navigate = useNavigate()
  const { refreshIdentity } = useAuth()

  const [form, setForm] = useState({
    fullName: '', email: '', password: '', confirm: '', code: '',
  })
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState(null)
  // Set when the account exists but the code did not redeem. Changes the
  // wording from "we could not sign you up" to "your account exists, the code
  // did not work" — the difference matters a great deal to the person typing.
  const [accountMade, setAccountMade] = useState(false)
  const [done, setDone]       = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function validate() {
    if (!form.fullName.trim())                return 'Please enter your full name.'
    if (!form.email.trim())                   return 'Please enter your email address.'
    if (form.password.length < MIN_PASSWORD)  return `Choose a password of at least ${MIN_PASSWORD} characters.`
    if (form.password !== form.confirm)       return 'The two passwords do not match.'
    if (!CODE_SHAPE.test(normaliseCode(form.code)))
      return 'That enrolment code is not valid.'
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const problem = validate()
    if (problem) { setError(problem); return }

    setBusy(true)
    setError(null)

    const email    = form.email.trim()
    const fullName = form.fullName.trim()
    const code     = normaliseCode(form.code)

    // ── Step 1: the account ──────────────────────────────────────
    if (!accountMade) {
      try {
        const result = await signUp(email, form.password, fullName)

        // Email confirmation is on for this project and no session came back.
        // Nothing more can happen until they click the link — redemption
        // needs an authenticated session (redeem_cohort_invite raises 28000
        // without one), so tell them plainly and stop here rather than
        // failing at step 2 with a confusing message.
        if (!result?.session) {
          setDone({ kind: 'confirm-email', email })
          setBusy(false)
          return
        }
      } catch (err) {
        setError(signupMessage(err))
        setBusy(false)
        return
      }
      setAccountMade(true)
    } else {
      // Retrying after a failed redemption: the account already exists, so
      // sign in rather than signing up again.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email, password: form.password,
      })
      if (signInErr) {
        setError('We could not sign you in with those details. Try signing in from the sign-in page.')
        setBusy(false)
        return
      }
    }

    // ── Step 2: the enrolment code ───────────────────────────────
    try {
      const bound = await redeemCohortInvite(code, fullName)
      await refreshIdentity()
      setDone({ kind: 'enrolled', cohortName: bound.cohortName })
      // The shell picks them up from "/" once the identity has resolved.
      navigate('/', { replace: true })
    } catch (err) {
      // Surface the RPC's message verbatim. It is the same sentence for
      // wrong / expired / revoked / exhausted, on purpose: anything more
      // specific would tell someone guessing codes which guesses are real.
      setError(err.message)
      setBusy(false)
    }
  }

  /**
   * Supabase auth errors, in the words the person needs.
   *
   * "Already registered" is passed through rather than hidden. Signup here is
   * gated by a code that a real participant was handed, and pretending an
   * address is free when it is not just moves the failure to the next screen.
   * (Where the address itself is the secret — password reset — Supabase
   * already answers identically either way, and we do not change that.)
   */
  function signupMessage(err) {
    const raw = (err?.message ?? '').toLowerCase()
    if (raw.includes('already registered') || raw.includes('already been registered') || raw.includes('user already exists')) {
      return 'An account already exists for that email address. Sign in instead — you can enter your enrolment code once you are signed in.'
    }
    if (raw.includes('password')) {
      return `That password was rejected. Choose one of at least ${MIN_PASSWORD} characters, and avoid anything obvious.`
    }
    if (raw.includes('email') && raw.includes('invalid')) {
      return 'That does not look like a valid email address.'
    }
    return err?.message ?? 'We could not create your account. Please try again.'
  }

  if (done?.kind === 'confirm-email') {
    return (
      <Frame>
        <h1 style={s.heading}>Confirm your email</h1>
        <div style={s.success}>
          We sent a confirmation link to <strong>{done.email}</strong>. Open it, sign in,
          and you will be asked for your enrolment code.
        </div>
        <div style={s.note}>
          Your enrolment code has not been used yet — keep it to hand.
        </div>
        <Link to="/login" style={s.link}>← Back to sign in</Link>
      </Frame>
    )
  }

  return (
    <Frame>
      <h1 style={s.heading}>Create your Morpheus account</h1>
      <p style={s.blurb}>
        You will need the enrolment code from your programme coordinator.
        The email address you register with is the one you will sign in with.
      </p>

      <form onSubmit={handleSubmit} style={s.form}>
        <label style={s.label}>Full name</label>
        <input
          style={s.input} required autoFocus autoComplete="name"
          value={form.fullName} onChange={e => set('fullName', e.target.value)}
          placeholder="Jordan Ellis"
        />

        <label style={s.label}>Email address</label>
        <input
          style={s.input} type="email" required autoComplete="email"
          value={form.email} onChange={e => set('email', e.target.value)}
          placeholder="you@example.com"
          readOnly={accountMade}
        />

        <label style={s.label}>Password</label>
        <input
          style={s.input} type="password" required autoComplete="new-password"
          value={form.password} onChange={e => set('password', e.target.value)}
          placeholder={`At least ${MIN_PASSWORD} characters`}
        />

        <label style={s.label}>Confirm password</label>
        <input
          style={s.input} type="password" required autoComplete="new-password"
          value={form.confirm} onChange={e => set('confirm', e.target.value)}
          placeholder="Type it again"
        />

        <label style={s.label}>Enrolment code</label>
        <input
          style={{ ...s.input, ...s.codeInput }} required autoComplete="off"
          value={form.code}
          onChange={e => set('code', e.target.value.toUpperCase())}
          placeholder="ABCD-EFGH-JKLM"
          spellCheck={false}
        />

        {accountMade && (
          <div style={s.note}>
            Your account was created. It just needs a valid enrolment code to finish.
          </div>
        )}
        {error && <div style={s.error}>{error}</div>}

        <button type="submit" style={s.btn} disabled={busy}>
          {busy ? 'Working…' : accountMade ? 'Try this code' : 'Create account'}
        </button>
      </form>

      <Link to="/login" style={s.link}>Already have an account? Sign in</Link>
    </Frame>
  )
}

function Frame({ children }) {
  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logoRow}>
          <span style={s.logoM}>M<span style={s.logoAccent}>.</span>orpheus</span>
        </div>
        <div style={s.logoSub}>Certified Training Standards · Albany, NY</div>
        {children}
        <div style={s.footer}>
          No enrolment code? Contact your trainer or programme coordinator.
        </div>
      </div>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100vh', background: '#0D1B2A', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    fontFamily: "'DM Sans', sans-serif", padding: '20px',
  },
  card: { background: '#fff', borderRadius: '16px', padding: '40px 44px', width: '100%', maxWidth: '440px' },
  logoRow: { marginBottom: '4px' },
  logoM: { fontSize: '26px', fontWeight: '500', color: '#0D1B2A', fontFamily: "'DM Mono', monospace", letterSpacing: '-0.5px' },
  logoAccent: { color: '#5DCAA5' },
  logoSub: { fontSize: '11px', color: '#8BA0B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '28px' },
  heading: { fontSize: '18px', fontWeight: '500', color: '#0D1B2A', marginBottom: '10px' },
  blurb: { fontSize: '13px', color: '#4A6080', lineHeight: '1.6', marginBottom: '20px' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' },
  label: { fontSize: '11px', fontWeight: '600', color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: {
    padding: '10px 12px', border: '1px solid #CBD8E6', borderRadius: '8px',
    fontSize: '14px', fontFamily: "'DM Sans', sans-serif", color: '#0D1B2A', outline: 'none',
  },
  codeInput: { fontFamily: "'DM Mono', monospace", letterSpacing: '0.12em' },
  btn: {
    padding: '11px', background: '#0D1B2A', color: '#fff', border: 'none', borderRadius: '8px',
    fontSize: '14px', fontWeight: '500', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginTop: '6px',
  },
  error: { fontSize: '13px', color: '#993C1D', background: '#FAECE7', borderRadius: '8px', padding: '10px 12px', lineHeight: '1.5' },
  note: { fontSize: '12px', color: '#5F5E5A', background: '#F1EFE8', borderRadius: '8px', padding: '10px 12px', lineHeight: '1.5' },
  success: { fontSize: '13px', color: '#0F6E56', background: '#E1F5EE', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', lineHeight: '1.6' },
  link: { background: 'none', border: 'none', color: '#2176AE', fontSize: '13px', cursor: 'pointer', padding: 0, fontFamily: "'DM Sans', sans-serif", textDecoration: 'none', display: 'inline-block' },
  footer: { marginTop: '28px', paddingTop: '18px', borderTop: '1px solid #E8EFF6', fontSize: '12px', color: '#8BA0B8', textAlign: 'center', lineHeight: '1.6' },
}
