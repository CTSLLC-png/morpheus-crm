// src/pages/FinishEnrolment.jsx
// ── Morpheus CRM — the landing place for an unresolved account ──
//
// Shown to a signed-in user the database cannot place: no recognised role in
// app_metadata, no participants row, no active vendor membership.
//
// In practice that is one of three people:
//   1. Someone who registered but whose enrolment code did not redeem.
//   2. Someone whose account was created by staff and never enrolled.
//   3. A staff or vendor account whose access has not been set up yet.
//
// The previous behaviour for all three was `<Navigate to="/login">`, which
// from a signed-in session is an infinite loop: you are already authenticated,
// so /login sends you straight back.
//
// This screen grants NOTHING. Its only action is redeem_cohort_invite, which
// every authenticated session may already call, and which is itself the gate.
// Cases 2 and 3 get a dead end with a clear instruction and a sign-out button,
// which is the correct outcome — access they have not been granted is not
// something a screen can fix.

import { useState } from 'react'
import { signOut } from '../lib/supabase.js'
import { redeemCohortInvite } from '../lib/identity.js'
import { normaliseCode, CODE_SHAPE } from '../lib/access.js'
import { useAuth } from '../hooks/useAuth.jsx'

export default function FinishEnrolment() {
  const { user, refreshIdentity } = useAuth()
  const [code, setCode]         = useState('')
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name ?? '')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    const normalised = normaliseCode(code)
    if (!CODE_SHAPE.test(normalised)) {
      // Same sentence the RPC uses. A client-side shape check that said
      // something different would tell a guesser which codes are even
      // shaped right, which is half the search space.
      setError('That enrolment code is not valid.')
      return
    }
    if (!fullName.trim()) { setError('Please enter your full name.'); return }

    setBusy(true); setError(null)
    try {
      await redeemCohortInvite(normalised, fullName.trim())
      // Re-resolve rather than reload: the participants row now exists, so
      // the router will place them in the participant shell on this render.
      await refreshIdentity()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logoRow}>
          <span style={s.logoM}>M<span style={s.logoAccent}>.</span>orpheus</span>
        </div>
        <div style={s.logoSub}>Certified Training Standards · Albany, NY</div>

        <h1 style={s.heading}>Finish your enrolment</h1>
        <p style={s.blurb}>
          You are signed in as <strong>{user?.email}</strong>, but this account is not
          attached to a cohort yet. Enter the enrolment code from your programme
          coordinator to finish.
        </p>

        <form onSubmit={handleSubmit} style={s.form}>
          <label style={s.label}>Full name</label>
          <input
            style={s.input} required autoComplete="name"
            value={fullName} onChange={e => setFullName(e.target.value)}
            placeholder="Jordan Ellis"
          />

          <label style={s.label}>Enrolment code</label>
          <input
            style={{ ...s.input, ...s.codeInput }} required autoFocus autoComplete="off"
            value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD-EFGH-JKLM" spellCheck={false}
          />

          {error && <div style={s.error}>{error}</div>}

          <button type="submit" style={s.btn} disabled={busy}>
            {busy ? 'Checking…' : 'Enrol'}
          </button>
        </form>

        <div style={s.footer}>
          If you are staff or a partner organisation, your access is set up by an
          administrator — an enrolment code will not help. Ask them to finish setting
          up your account.
          <div style={{ marginTop: '12px' }}>
            <button style={s.link} onClick={() => signOut()}>Sign out</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", padding: '20px' },
  card: { background: '#fff', borderRadius: '16px', padding: '40px 44px', width: '100%', maxWidth: '440px' },
  logoRow: { marginBottom: '4px' },
  logoM: { fontSize: '26px', fontWeight: '500', color: '#0D1B2A', fontFamily: "'DM Mono', monospace", letterSpacing: '-0.5px' },
  logoAccent: { color: '#5DCAA5' },
  logoSub: { fontSize: '11px', color: '#8BA0B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '28px' },
  heading: { fontSize: '18px', fontWeight: '500', color: '#0D1B2A', marginBottom: '10px' },
  blurb: { fontSize: '13px', color: '#4A6080', lineHeight: '1.6', marginBottom: '20px' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px' },
  label: { fontSize: '11px', fontWeight: '600', color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: { padding: '10px 12px', border: '1px solid #CBD8E6', borderRadius: '8px', fontSize: '14px', fontFamily: "'DM Sans', sans-serif", color: '#0D1B2A', outline: 'none' },
  codeInput: { fontFamily: "'DM Mono', monospace", letterSpacing: '0.12em' },
  btn: { padding: '11px', background: '#0D1B2A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginTop: '6px' },
  error: { fontSize: '13px', color: '#993C1D', background: '#FAECE7', borderRadius: '8px', padding: '10px 12px', lineHeight: '1.5' },
  link: { background: 'none', border: 'none', color: '#2176AE', fontSize: '13px', cursor: 'pointer', padding: 0, fontFamily: "'DM Sans', sans-serif" },
  footer: { marginTop: '26px', paddingTop: '18px', borderTop: '1px solid #E8EFF6', fontSize: '12px', color: '#8BA0B8', textAlign: 'center', lineHeight: '1.6' },
}
