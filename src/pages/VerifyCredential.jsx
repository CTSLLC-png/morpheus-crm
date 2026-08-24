// src/pages/VerifyCredential.jsx
// ── MORPHEUS.EDU / EDU.VERIFY — public credential verification ──
// No login required. Anyone with a credential code (from a résumé,
// certificate, or LinkedIn) can confirm it against the live registry.

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { verifyCredential } from '../lib/edu.js'

export default function VerifyCredential() {
  const { code: urlCode } = useParams()
  const [code, setCode]     = useState(urlCode ?? '')
  const [result, setResult] = useState(undefined) // undefined=idle, null=not found, obj=found
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState(null)

  async function lookup(c) {
    if (!c?.trim()) return
    setBusy(true); setError(null)
    try {
      const r = await verifyCredential(c.trim())
      setResult(r)
    } catch (e) { setError(e.message); setResult(undefined) }
    setBusy(false)
  }

  useEffect(() => { if (urlCode) lookup(urlCode) }, [urlCode])

  const statusUi = result ? {
    active:  { bg: '#0F6E56', label: 'VALID — ACTIVE', icon: '✓' },
    expired: { bg: '#BA7517', label: 'EXPIRED', icon: '!' },
    revoked: { bg: '#993C1D', label: 'REVOKED', icon: '✕' },
  }[result.status] : null

  return (
    <div style={st.page}>
      <div style={st.card}>
        <div style={st.logo}>M<span style={{ color: '#5DCAA5' }}>.</span>orpheus</div>
        <div style={st.kicker}>MORPHEUS.EDU · CREDENTIAL VERIFICATION</div>
        <div style={st.title}>Verify a credential</div>
        <div style={st.sub}>
          Enter a credential code exactly as it appears on the certificate
          (e.g. <span style={st.mono}>CTS-CAPC-2026-000001</span>).
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <input
            style={st.input}
            value={code}
            placeholder="CTS-CAPC-YYYY-NNNNNN"
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookup(code)}
          />
          <button style={st.btn} onClick={() => lookup(code)} disabled={busy}>
            {busy ? 'Checking…' : 'Verify'}
          </button>
        </div>

        {error && <div style={st.errorBox}>Could not reach the registry: {error}</div>}

        {result === null && (
          <div style={st.notFound}>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>No record found</div>
            <div style={{ fontSize: '12.5px', lineHeight: 1.6 }}>
              This code does not match any credential in the registry. Check for typos —
              codes are letters, digits, and dashes only. If the code came from a certificate
              and still does not verify, treat the certificate as unconfirmed and contact CTS LLC.
            </div>
          </div>
        )}

        {result && (
          <div style={st.result}>
            <div style={{ ...st.statusBar, background: statusUi.bg }}>
              <span style={st.statusIcon}>{statusUi.icon}</span> {statusUi.label}
            </div>
            <div style={st.resultBody}>
              {[
                ['Credential', result.credential_name],
                ['Holder', result.holder_name],
                ['Code', result.credential_code],
                ['Issued by', result.issuer_org],
                ['Issued', new Date(result.issued_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
                ['Expires', result.expires_at ? new Date(result.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'No expiration'],
              ].map(([k, v]) => (
                <div key={k} style={st.row}>
                  <span style={st.rowKey}>{k}</span>
                  <span style={st.rowVal}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={st.footer}>
          This registry is operated by CTS LLC · Albany, NY. CAP-C and related credentials are
          developed and issued independently by CTS LLC and are not produced, endorsed, or
          certified by Anthropic. Claude is a trademark of Anthropic, PBC.
        </div>
      </div>
    </div>
  )
}

const st = {
  page:   { minHeight: '100vh', background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: "'DM Sans',sans-serif" },
  card:   { background: '#fff', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '480px' },
  logo:   { fontFamily: "'DM Mono',monospace", fontSize: '20px', fontWeight: 500, color: '#0D1B2A', marginBottom: '14px' },
  kicker: { fontSize: '10px', letterSpacing: '0.12em', color: '#5DCAA5', fontFamily: "'DM Mono',monospace", marginBottom: '6px' },
  title:  { fontSize: '22px', fontWeight: 600, color: '#0D1B2A', marginBottom: '6px' },
  sub:    { fontSize: '12.5px', color: '#4A6080', lineHeight: 1.6, marginBottom: '18px' },
  mono:   { fontFamily: "'DM Mono',monospace", fontSize: '11.5px', background: '#F0F4F8', padding: '1px 5px', borderRadius: '4px' },
  input:  { flex: 1, padding: '10px 12px', border: '1px solid #CBD8E6', borderRadius: '10px', fontSize: '13px', fontFamily: "'DM Mono',monospace", textTransform: 'uppercase' },
  btn:    { padding: '10px 20px', border: 'none', borderRadius: '10px', background: '#0D1B2A', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" },
  errorBox:{ background: '#FAECE7', color: '#993C1D', borderRadius: '10px', padding: '12px 14px', fontSize: '12.5px', marginBottom: '14px' },
  notFound:{ background: '#FAEEDA', color: '#7A5210', borderRadius: '12px', padding: '16px 18px' },
  result: { border: '1px solid #CBD8E6', borderRadius: '14px', overflow: 'hidden' },
  statusBar:{ color: '#fff', padding: '12px 18px', fontSize: '13px', fontWeight: 700, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '10px' },
  statusIcon:{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' },
  resultBody:{ padding: '8px 18px 12px' },
  row:    { display: 'flex', justifyContent: 'space-between', gap: '14px', padding: '9px 0', borderBottom: '1px solid #F0F4F8', fontSize: '13px' },
  rowKey: { color: '#8BA0B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: '2px', flexShrink: 0 },
  rowVal: { color: '#0D1B2A', fontWeight: 500, textAlign: 'right' },
  footer: { fontSize: '10px', color: '#8BA0B8', lineHeight: 1.6, marginTop: '20px', paddingTop: '14px', borderTop: '1px solid #F0F4F8' },
}
