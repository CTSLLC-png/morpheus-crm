// src/pages/FinishEnrolment.jsx
// ── Nguzo OS — the landing place for an account the router cannot place ──
//
// Shown to a signed-in user who is not a participant, not staff and not a
// partner. In practice that is one of three people:
//
//   1. Someone who registered but whose enrolment code did not redeem
//      (reason="no-participant").
//   2. An account with no role at all in app_metadata (reason="no-role").
//   3. An account carrying a role this build does not route
//      (reason="unknown-role").
//
// The previous behaviour for all three was <Navigate to="/login" />, which
// from a signed-in session is an infinite loop: you are already
// authenticated, so /login sends you straight back to "/".
//
// THIS SCREEN GRANTS NOTHING. Its only action is redeem_cohort_invite, which
// every authenticated session may already call and which is itself the gate.
// Case 3 gets a dead end with a clear instruction and a sign-out button, and
// that is the correct outcome: access somebody has not been granted is not
// something a screen can fix. An unrecognised role is never silently
// upgraded to participant.

import { useState } from 'react'
import { signOut } from '../lib/supabase.js'
import { redeemCohortInvite } from '../lib/enrolment.js'
import { useAuth } from '../hooks/useAuth.jsx'

export default function FinishEnrolment({ reason = 'no-participant' }) {
  const { user, role, participantId, refreshIdentity } = useAuth()
  const [code, setCode]         = useState('')
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name ?? '')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState(null)
  const [stranded, setStranded] = useState(false)

  // A code can only help someone whose account is simply not attached to a
  // cohort yet. An account carrying a role this build cannot route has a
  // different problem, and offering a code box would be a false promise.
  const codeCanHelp = reason !== 'unknown-role'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fullName.trim()) { setError('Please enter your full name.'); return }

    setBusy(true); setError(null)
    try {
      await redeemCohortInvite(code, fullName.trim())
      const next = await refreshIdentity()
      // Redemption created the participants row. If app_metadata still
      // carries no routable role, the router would send them straight back
      // here — so say what actually happened instead of looping.
      if (!next?.role) {
        setStranded(true)
        setBusy(false)
      }
      // Otherwise the router re-renders into their portal; nothing to do.
    } catch (err) {
      // Verbatim, unclassified. See the header of lib/enrolment.js.
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

        {stranded ? (
          <>
            <h1 style={s.heading}>Enrolment recorded</h1>
            <div style={s.success}>
              Your enrolment is on file. Your account still needs to be switched on
              for the participant portal, which an administrator does.
            </div>
            <p style={s.blurb}>
              Nothing further is needed from you. Contact your trainer or program
              coordinator if you are not let in within a working day.
            </p>
          </>
        ) : (
          <>
            <h1 style={s.heading}>
              {codeCanHelp ? 'Finish your enrolment' : 'Your account is not set up yet'}
            </h1>
            <p style={s.blurb}>
              You are signed in as <strong>{user?.email}</strong>, but this account is not
              attached to a cohort or a workspace yet.
              {codeCanHelp && ' Enter the enrolment code from your program coordinator to finish.'}
            </p>

            {codeCanHelp && (
              <form onSubmit={handleSubmit} style={s.form}>
                <label style={s.label} htmlFor="finish-full-name">Full name</label>
                <input id="finish-full-name"
                  style={s.input} required autoComplete="name"
                  value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder="Jordan Ellis"
                />

                <label style={s.label} htmlFor="finish-code">Enrolment code</label>
                <input id="finish-code"
                  style={{ ...s.input, ...s.codeInput }} required autoFocus autoComplete="off"
                  value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="ABCD-EFGH-JKLM" spellCheck={false}
                />

                {error && <div style={s.error} role="alert">{error}</div>}

                <button type="submit" style={s.btn} disabled={busy}>
                  {busy ? 'Checking…' : 'Enrol'}
                </button>
              </form>
            )}
          </>
        )}

        <div style={s.footer}>
          If you are staff or with a partner organisation, your access is set up by an
          administrator — an enrolment code will not help. Ask them to finish setting
          up your account.
          <div style={s.diag}>
            {role ? `Account role: ${role}` : 'Account role: not set'}
            {participantId ? ' · enrolment on file' : ''}
          </div>
          <div style={{ marginTop: '12px' }}>
            <button type="button" style={s.link} onClick={() => signOut({ participantId })}>Sign out</button>
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
  logoSub: { fontSize: '11px', color: '#5D768A', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '28px' },
  heading: { fontSize: '18px', fontWeight: '500', color: '#0D1B2A', marginBottom: '10px' },
  blurb: { fontSize: '13px', color: '#4A6080', lineHeight: '1.6', marginBottom: '20px' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px' },
  label: { fontSize: '11px', fontWeight: '600', color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: { padding: '10px 12px', border: '1px solid #CBD8E6', borderRadius: '8px', fontSize: '14px', fontFamily: "'DM Sans', sans-serif", color: '#0D1B2A', outline: 'none' },
  codeInput: { fontFamily: "'DM Mono', monospace", letterSpacing: '0.12em' },
  btn: { padding: '11px', background: '#0D1B2A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginTop: '6px' },
  error: { fontSize: '13px', color: '#993C1D', background: '#FAECE7', borderRadius: '8px', padding: '10px 12px', lineHeight: '1.5' },
  success: { fontSize: '13px', color: '#0F6E56', background: '#E1F5EE', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', lineHeight: '1.6' },
  link: { background: 'none', border: 'none', color: '#2176AE', fontSize: '13px', cursor: 'pointer', padding: 0, fontFamily: "'DM Sans', sans-serif" },
  footer: { marginTop: '26px', paddingTop: '18px', borderTop: '1px solid #E8EFF6', fontSize: '12px', color: '#5D768A', textAlign: 'center', lineHeight: '1.6' },
  diag: { marginTop: '10px', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: '#8BA0B8' },
}
