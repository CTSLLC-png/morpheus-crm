// src/pages/AcademyAdmin.jsx
// ── MORPHEUS.EDU — Claude Academy (trainer/admin view) ─────────
// Cohort-wide course progress, checkpoint results, and the
// EDU.REGISTRY credential registry with issue/revoke controls.

import { useState, useEffect } from 'react'
import { getCourse, getAcademyOverview, getCredentialRegistry, issueCredential, revokeCredential } from '../lib/edu.js'
import { generateEduCertificatePDF } from '../lib/educert.js'

function pctColor(p) { return p >= 80 ? '#0F6E56' : p >= 40 ? '#BA7517' : '#8BA0B8' }

export default function AcademyAdmin({ staffProfileId }) {
  const [course, setCourse]     = useState(null)
  const [rows, setRows]         = useState([])
  const [registry, setRegistry] = useState([])
  const [tab, setTab]           = useState('progress') // progress | registry
  const [busy, setBusy]         = useState(null)
  const [error, setError]       = useState(null)

  async function load() {
    try {
      const c = await getCourse('CAP-C')
      setCourse(c)
      const [ov, reg] = await Promise.all([getAcademyOverview(c.id), getCredentialRegistry()])
      setRows(ov)
      setRegistry(reg)
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  async function handleIssue(row) {
    if (!course) return
    if (!window.confirm(`Issue "${course.credential_name}" to ${row.full_name}? This writes a permanent record to the credential registry.`)) return
    setBusy(row.id)
    try {
      await issueCredential({
        course,
        participantId: row.id,
        holderName: row.full_name,
        issuedBy: staffProfileId ?? null,
        expiresMonths: 24,
      })
      await load()
      setTab('registry')
    } catch (e) { setError(e.message) }
    setBusy(null)
  }

  async function handleRevoke(cred) {
    if (!window.confirm(`Revoke ${cred.credential_code} (${cred.holder_name})? The public verify page will show it as revoked.`)) return
    try { await revokeCredential(cred.id); await load() } catch (e) { setError(e.message) }
  }

  if (error)   return <div style={st.error}>Academy error: {error}</div>
  if (!course) return <div style={st.loading}>Loading Academy…</div>

  const availableModules = course.modules.filter(m => m.status === 'available')
  const credentialed = new Set(registry.filter(r => r.status === 'active').map(r => r.participant_id))

  return (
    <div>
      {/* Header stats */}
      <div style={st.statRow}>
        {[
          { label: 'Course', value: course.code, sub: course.credential_name },
          { label: 'Modules live', value: availableModules.length, sub: `${course.modules.length} total (rest post-pilot)` },
          { label: 'Learners active', value: rows.filter(r => r.lessonsDone > 0).length, sub: `${rows.length} enrolled in Morpheus` },
          { label: 'Credentials issued', value: registry.filter(r => r.status === 'active').length, sub: 'EDU.REGISTRY' },
        ].map((m, i) => (
          <div key={i} style={st.stat}>
            <div style={st.statLabel}>{m.label}</div>
            <div style={st.statVal}>{m.value}</div>
            <div style={st.statSub}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={st.tabs}>
        {[['progress', 'Learner progress'], ['registry', `Credential registry (${registry.length})`]].map(([k, label]) => (
          <div key={k} style={{ ...st.tab, ...(tab === k ? st.tabActive : {}) }} onClick={() => setTab(k)}>{label}</div>
        ))}
      </div>

      {tab === 'progress' && (
        <div style={st.tableCard}>
          <table style={st.table}>
            <thead><tr style={{ background: '#F7F9FC' }}>
              {['CTS ID', 'Name', 'Lessons', 'Progress', 'Checkpoints passed', 'Credential'].map(h => (
                <th key={h} style={st.th}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid #F0F4F8' : 'none' }}>
                  <td style={st.tdMono}>{r.cts_id}</td>
                  <td style={{ ...st.td, fontWeight: 500 }}>{r.full_name}</td>
                  <td style={st.td}>{r.lessonsDone}/{r.lessonsTotal}</td>
                  <td style={st.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={st.pbar}><div style={{ ...st.pfill, width: `${r.pct}%`, background: pctColor(r.pct) }} /></div>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '11px', color: pctColor(r.pct), width: '32px' }}>{r.pct}%</span>
                    </div>
                  </td>
                  <td style={st.td}>{r.checkpointsPassed}/{availableModules.length}</td>
                  <td style={st.td}>
                    {credentialed.has(r.id)
                      ? <span style={st.certPill}>Issued ✓</span>
                      : <button style={{ ...st.btnSm, opacity: busy === r.id ? 0.5 : 1 }} disabled={busy === r.id}
                          onClick={() => handleIssue(r)}>
                          {busy === r.id ? 'Issuing…' : 'Issue credential'}
                        </button>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} style={st.emptyRow}>No participants enrolled yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'registry' && (
        <div style={st.tableCard}>
          <table style={st.table}>
            <thead><tr style={{ background: '#F7F9FC' }}>
              {['Code', 'Holder', 'Credential', 'Issued', 'Expires', 'Status', ''].map(h => (
                <th key={h} style={st.th}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {registry.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: i < registry.length - 1 ? '1px solid #F0F4F8' : 'none' }}>
                  <td style={st.tdMono}>
                    <a href={`/verify/${c.credential_code}`} target="_blank" rel="noreferrer" style={{ color: '#2176AE', textDecoration: 'none' }}>
                      {c.credential_code}
                    </a>
                  </td>
                  <td style={{ ...st.td, fontWeight: 500 }}>{c.holder_name}</td>
                  <td style={st.td}>{c.credential_name}</td>
                  <td style={st.tdMono}>{new Date(c.issued_at).toLocaleDateString()}</td>
                  <td style={st.tdMono}>{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : '—'}</td>
                  <td style={st.td}>
                    <span style={{ ...st.statusPill, background: c.status === 'active' ? '#E1F5EE' : '#FAECE7', color: c.status === 'active' ? '#0F6E56' : '#993C1D' }}>
                      {c.status}
                    </span>
                  </td>
                  <td style={st.td}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {c.status === 'active' && <button style={st.btnSm} onClick={() => generateEduCertificatePDF(c)}>PDF ↓</button>}
                      {c.status === 'active' && <button style={st.btnDanger} onClick={() => handleRevoke(c)}>Revoke</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {registry.length === 0 && <tr><td colSpan={7} style={st.emptyRow}>No credentials issued yet. Issue one from the Learner progress tab.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div style={st.note}>
        Every credential is a permanent registry record, publicly verifiable at
        <b> {window.location.origin}/verify/&lt;code&gt;</b>. CAP-C is issued by CTS LLC and is
        not an Anthropic certification.
      </div>
    </div>
  )
}

const st = {
  loading: { padding: '40px', color: '#8BA0B8', fontSize: '13px' },
  error:   { background: '#FAECE7', color: '#993C1D', borderRadius: '10px', padding: '14px 16px', fontSize: '13px' },
  statRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' },
  stat:    { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '12px', padding: '14px 16px' },
  statLabel:{ fontSize: '10px', color: '#8BA0B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' },
  statVal: { fontSize: '24px', fontWeight: 300, color: '#0D1B2A', fontFamily: "'DM Mono',monospace", lineHeight: 1 },
  statSub: { fontSize: '10.5px', color: '#8BA0B8', marginTop: '5px' },
  tabs:    { display: 'flex', gap: '4px', marginBottom: '12px' },
  tab:     { padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, color: '#4A6080', cursor: 'pointer', border: '1px solid transparent' },
  tabActive:{ background: '#fff', border: '1px solid #CBD8E6', color: '#0D1B2A' },
  tableCard:{ background: '#fff', border: '1px solid #CBD8E6', borderRadius: '16px', overflow: 'hidden' },
  table:   { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:      { padding: '9px 14px', textAlign: 'left', fontWeight: 500, fontSize: '11px', color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #CBD8E6' },
  td:      { padding: '10px 14px', color: '#0D1B2A' },
  tdMono:  { padding: '10px 14px', fontFamily: "'DM Mono',monospace", fontSize: '11px', color: '#4A6080' },
  pbar:    { flex: 1, maxWidth: '120px', height: '6px', background: '#F0F4F8', borderRadius: '3px', overflow: 'hidden' },
  pfill:   { height: '100%', borderRadius: '3px', transition: 'width 0.5s ease' },
  certPill:{ fontSize: '10px', fontWeight: 600, padding: '3px 10px', borderRadius: '12px', background: '#E1F5EE', color: '#0F6E56' },
  statusPill:{ fontSize: '10px', fontWeight: 600, padding: '2px 9px', borderRadius: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' },
  btnSm:   { padding: '5px 12px', border: 'none', borderRadius: '7px', background: '#0D1B2A', color: '#fff', fontSize: '11px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" },
  btnDanger:{ padding: '4px 10px', border: '1px solid #E8C4B8', borderRadius: '7px', background: '#fff', color: '#993C1D', fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" },
  emptyRow:{ padding: '24px', textAlign: 'center', color: '#8BA0B8', fontStyle: 'italic' },
  note:    { fontSize: '10.5px', color: '#8BA0B8', lineHeight: 1.6, padding: '14px 4px' },
}
