// src/pages/ResetPassword.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updatePassword } from '../lib/supabase.js'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return }
    setLoading(true); setError(null)
    try {
      await updatePassword(password)
      setDone(true)
      setTimeout(() => navigate('/'), 2000)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const s = {
    page: { minHeight:'100vh', background:'#0D1B2A', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", padding:'20px' },
    card: { background:'#fff', borderRadius:'16px', padding:'36px 40px', width:'100%', maxWidth:'400px' },
    logo: { fontFamily:"'DM Mono',monospace", fontSize:'22px', fontWeight:500, color:'#0D1B2A', marginBottom:'4px' },
    accent: { color:'#5DCAA5' },
    sub: { fontSize:'11px', color:'#8BA0B8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'24px' },
    heading: { fontSize:'17px', fontWeight:500, color:'#0D1B2A', marginBottom:'20px' },
    form: { display:'flex', flexDirection:'column', gap:'12px' },
    label: { fontSize:'11px', fontWeight:600, color:'#4A6080', textTransform:'uppercase', letterSpacing:'0.06em' },
    input: { padding:'10px 12px', border:'1px solid #CBD8E6', borderRadius:'8px', fontSize:'14px', fontFamily:"'DM Sans',sans-serif", color:'#0D1B2A', width:'100%' },
    btn: { padding:'11px', background:'#0D1B2A', color:'#fff', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" },
    error: { fontSize:'13px', color:'#993C1D', background:'#FAECE7', borderRadius:'8px', padding:'10px 12px' },
    success: { fontSize:'13px', color:'#0F6E56', background:'#E1F5EE', borderRadius:'8px', padding:'12px 14px', lineHeight:'1.6' },
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>M<span style={s.accent}>.</span>orpheus</div>
        <div style={s.sub}>Certified Training Standards</div>
        <h1 style={s.heading}>Set new password</h1>
        {done ? (
          <div style={s.success}>Password updated. Redirecting you to Morpheus…</div>
        ) : (
          <form onSubmit={handleSubmit} style={s.form}>
            <label style={s.label}>New password</label>
            <input style={s.input} type="password" required minLength={8}
              value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" />
            <label style={s.label}>Confirm password</label>
            <input style={s.input} type="password" required
              value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" />
            {error && <div style={s.error}>{error}</div>}
            <button style={s.btn} type="submit" disabled={loading}>
              {loading ? 'Updating…' : 'Set password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
