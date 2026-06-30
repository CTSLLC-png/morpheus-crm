// src/pages/Login.jsx
// ── Morpheus CRM — Login page ───────────────────────────────────

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, sendPasswordReset } from '../lib/supabase.js'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [resetSent, setResetSent] = useState(false)
  const [mode, setMode]         = useState('login') // 'login' | 'reset'

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await sendPasswordReset(email)
      setResetSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoRow}>
          <span style={styles.logoM}>M<span style={styles.logoAccent}>.</span>orpheus</span>
        </div>
        <div style={styles.logoSub}>Certified Training Standards · Albany, NY</div>

        {mode === 'login' ? (
          <>
            <h1 style={styles.heading}>Sign in to Morpheus</h1>
            <form onSubmit={handleLogin} style={styles.form}>
              <label style={styles.label}>Email address</label>
              <input
                type="email" required autoFocus
                style={styles.input}
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <label style={styles.label}>Password</label>
              <input
                type="password" required
                style={styles.input}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              {error && <div style={styles.error}>{error}</div>}
              <button type="submit" style={styles.btn} disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <button
              style={styles.link}
              onClick={() => { setMode('reset'); setError(null) }}
            >
              Forgot password?
            </button>
          </>
        ) : (
          <>
            <h1 style={styles.heading}>Reset your password</h1>
            {resetSent ? (
              <div style={styles.success}>
                Check your email — we sent a reset link to <strong>{email}</strong>.
              </div>
            ) : (
              <form onSubmit={handleReset} style={styles.form}>
                <label style={styles.label}>Email address</label>
                <input
                  type="email" required autoFocus
                  style={styles.input}
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                {error && <div style={styles.error}>{error}</div>}
                <button type="submit" style={styles.btn} disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            )}
            <button style={styles.link} onClick={() => { setMode('login'); setError(null); setResetSent(false) }}>
              ← Back to sign in
            </button>
          </>
        )}

        <div style={styles.footer}>
          Having trouble? Contact your trainer or program coordinator.
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0D1B2A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'DM Sans', sans-serif",
    padding: '20px',
  },
  card: {
    background: '#fff',
    borderRadius: '16px',
    padding: '40px 44px',
    width: '100%',
    maxWidth: '420px',
  },
  logoRow: { marginBottom: '4px' },
  logoM: { fontSize: '26px', fontWeight: '500', color: '#0D1B2A', fontFamily: "'DM Mono', monospace", letterSpacing: '-0.5px' },
  logoAccent: { color: '#5DCAA5' },
  logoSub: { fontSize: '11px', color: '#8BA0B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '28px' },
  heading: { fontSize: '18px', fontWeight: '500', color: '#0D1B2A', marginBottom: '22px' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' },
  label: { fontSize: '11px', fontWeight: '600', color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: {
    padding: '10px 12px', border: '1px solid #CBD8E6', borderRadius: '8px',
    fontSize: '14px', fontFamily: "'DM Sans', sans-serif", color: '#0D1B2A',
    outline: 'none', transition: 'border-color 0.15s',
  },
  btn: {
    padding: '11px', background: '#0D1B2A', color: '#fff', border: 'none',
    borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif", marginTop: '4px', transition: 'background 0.15s',
  },
  error: { fontSize: '13px', color: '#993C1D', background: '#FAECE7', borderRadius: '8px', padding: '10px 12px' },
  success: { fontSize: '13px', color: '#0F6E56', background: '#E1F5EE', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', lineHeight: '1.6' },
  link: { background: 'none', border: 'none', color: '#2176AE', fontSize: '13px', cursor: 'pointer', padding: '0', fontFamily: "'DM Sans', sans-serif" },
  footer: { marginTop: '28px', paddingTop: '18px', borderTop: '1px solid #E8EFF6', fontSize: '12px', color: '#8BA0B8', textAlign: 'center', lineHeight: '1.6' },
}
