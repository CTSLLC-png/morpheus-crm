// src/pages/EnrolmentCodes.jsx
// ── Morpheus CRM — staff: enrolment codes per cohort ────────────
//
// Issue, label, cap, expire and revoke the codes that gate participant
// self-registration.
//
// A code is a bearer secret: whoever holds it can join the cohort it points
// at. Two consequences visible in this screen:
//   * codes are generated with crypto.getRandomValues, never typed by hand
//     (see lib/access.js) — a memorable code is a guessable one;
//   * revocation is a timestamp, never a delete, so the redemption ledger
//     stays intact. redeem_cohort_invite() reads revoked_at live, so a
//     revoked code stops working on the next attempt with no delay.

import { useEffect, useMemo, useState } from 'react'
import { getCohortOverview } from '../lib/db.js'
import {
  listInviteCodes, issueInviteCode, updateInviteCode, revokeInviteCode,
  expireInviteCode, generateInviteCode, codeState, listRedemptions,
} from '../lib/access.js'

const STATE_STYLE = {
  ACTIVE:    { bg: '#E1F5EE', color: '#0F6E56' },
  EXPIRED:   { bg: '#F1EFE8', color: '#5F5E5A' },
  EXHAUSTED: { bg: '#FDF3E3', color: '#BA7517' },
  REVOKED:   { bg: '#FAECE7', color: '#993C1D' },
}

export default function EnrolmentCodes({ staffProfileId = null }) {
  const [cohorts, setCohorts] = useState([])
  const [codes, setCodes]     = useState([])
  const [ledger, setLedger]   = useState([])
  const [cohortId, setCohortId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [busyId, setBusyId]   = useState(null)
  const [showIssue, setShowIssue] = useState(false)

  const [draft, setDraft] = useState({ code: '', label: '', maxUses: '', expiresAt: '' })

  useEffect(() => { reload() }, [])

  async function reload() {
    setLoading(true); setError(null)
    try {
      const [c, k, r] = await Promise.all([getCohortOverview(), listInviteCodes(), listRedemptions()])
      setCohorts(c ?? [])
      setCodes(k)
      setLedger(r)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const visible = useMemo(
    () => (cohortId ? codes.filter(k => k.cohort_id === cohortId) : codes),
    [codes, cohortId],
  )
  const cohortName = id => cohorts.find(c => c.id === id)?.name ?? '—'

  function openIssue() {
    setDraft({ code: generateInviteCode(), label: '', maxUses: '', expiresAt: '' })
    setShowIssue(true)
    setError(null)
  }

  async function handleIssue(e) {
    e.preventDefault()
    if (!cohortId) { setError('Choose a cohort before issuing a code.'); return }
    setBusyId('new'); setError(null)
    try {
      const created = await issueInviteCode({
        cohortId,
        code: draft.code,
        label: draft.label,
        maxUses: draft.maxUses,
        expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
        createdBy: staffProfileId,
      })
      setCodes(prev => [created, ...prev])
      setShowIssue(false)
    } catch (e) { setError(e.message) }
    finally { setBusyId(null) }
  }

  async function handleRevoke(code) {
    // Irreversible, and it cuts off anyone still holding the printed sheet.
    if (!window.confirm(`Revoke ${code.code}? This cannot be undone. Anyone still holding this code will no longer be able to enrol.`)) return
    setBusyId(code.id); setError(null)
    try {
      const updated = await revokeInviteCode(code.id)
      setCodes(prev => prev.map(k => k.id === code.id ? { ...k, revoked_at: updated.revoked_at } : k))
    } catch (e) { setError(e.message) }
    finally { setBusyId(null) }
  }

  async function handleExpire(code) {
    setBusyId(code.id); setError(null)
    try {
      const updated = await expireInviteCode(code.id)
      setCodes(prev => prev.map(k => k.id === code.id ? updated : k))
    } catch (e) { setError(e.message) }
    finally { setBusyId(null) }
  }

  async function handlePatch(code, patch) {
    setBusyId(code.id); setError(null)
    try {
      const updated = await updateInviteCode(code.id, patch)
      setCodes(prev => prev.map(k => k.id === code.id ? updated : k))
    } catch (e) { setError(e.message) }
    finally { setBusyId(null) }
  }

  if (loading) return <div style={s.loading}>Loading enrolment codes…</div>

  return (
    <div style={s.page}>
      <div style={s.topRow}>
        <div>
          <h1 style={s.title}>Enrolment codes</h1>
          <p style={s.sub}>
            Codes gate participant self-registration and bind the new participant to one cohort.
          </p>
        </div>
        <div style={s.topActions}>
          <select style={s.select} value={cohortId} onChange={e => setCohortId(e.target.value)}>
            <option value="">All cohorts</option>
            {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button style={s.btnPrimary} onClick={openIssue} disabled={!cohortId}
                  title={cohortId ? '' : 'Choose a cohort first'}>
            + Issue code
          </button>
        </div>
      </div>

      <div style={s.warnBox}>
        An enrolment code is a password for a cohort. Send it to one named person or
        facility, cap the uses, and give it an expiry. Revoke it the moment it has
        served its purpose.
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {showIssue && (
        <div style={s.modal}>
          <form style={s.modalCard} onSubmit={handleIssue}>
            <div style={s.modalTitle}>Issue a code for {cohortName(cohortId)}</div>

            <label style={s.label}>Code</label>
            <div style={s.codeRow}>
              <input style={{ ...s.input, ...s.codeInput }} value={draft.code}
                     onChange={e => setDraft(d => ({ ...d, code: e.target.value.toUpperCase() }))} />
              <button type="button" style={s.btnGhost}
                      onClick={() => setDraft(d => ({ ...d, code: generateInviteCode() }))}>
                Regenerate
              </button>
            </div>
            <div style={s.hint}>
              Generated with a cryptographic random source, and without the characters
              people mistype (I, O, 0, 1). Edit only if you have a reason to.
            </div>

            <label style={s.label}>Label</label>
            <input style={s.input} value={draft.label} placeholder="e.g. Albany LDSS — March intake"
                   onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} />
            <div style={s.hint}>Who you gave it to. Only staff ever see this.</div>

            <div style={s.twoUp}>
              <div>
                <label style={s.label}>Maximum uses</label>
                <input style={s.input} type="number" min="1" value={draft.maxUses}
                       placeholder="Unlimited"
                       onChange={e => setDraft(d => ({ ...d, maxUses: e.target.value }))} />
              </div>
              <div>
                <label style={s.label}>Expires</label>
                <input style={s.input} type="datetime-local" value={draft.expiresAt}
                       onChange={e => setDraft(d => ({ ...d, expiresAt: e.target.value }))} />
              </div>
            </div>
            <div style={s.hint}>Both optional, but a code with neither never stops working.</div>

            <div style={s.modalActions}>
              <button type="button" style={s.btnGhost} onClick={() => setShowIssue(false)}>Cancel</button>
              <button type="submit" style={s.btnPrimary} disabled={busyId === 'new'}>
                {busyId === 'new' ? 'Issuing…' : 'Issue code'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={s.panel}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Code</th><th style={s.th}>Cohort</th><th style={s.th}>Label</th>
              <th style={s.th}>Uses</th><th style={s.th}>Expires</th>
              <th style={s.th}>State</th><th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td style={s.td} colSpan={7}>
                No codes {cohortId ? 'for this cohort' : 'issued'} yet.
              </td></tr>
            )}
            {visible.map(k => {
              const state = codeState(k)
              const st = STATE_STYLE[state]
              const dead = state === 'REVOKED'
              return (
                <tr key={k.id} style={s.tr}>
                  <td style={{ ...s.td, ...s.mono }}>{k.code}</td>
                  <td style={s.td}>{cohortName(k.cohort_id)}</td>
                  <td style={s.td}>
                    <input
                      style={s.inlineInput} defaultValue={k.label ?? ''} placeholder="—"
                      disabled={dead}
                      onBlur={e => {
                        if ((e.target.value || '') !== (k.label ?? '')) handlePatch(k, { label: e.target.value })
                      }}
                    />
                  </td>
                  <td style={s.td}>
                    {k.uses}
                    {' / '}
                    <input
                      style={{ ...s.inlineInput, width: '62px' }} type="number" min="1"
                      defaultValue={k.max_uses ?? ''} placeholder="∞" disabled={dead}
                      onBlur={e => {
                        const next = e.target.value === '' ? null : Number(e.target.value)
                        if (next !== (k.max_uses ?? null)) handlePatch(k, { maxUses: next })
                      }}
                    />
                  </td>
                  <td style={s.td}>{k.expires_at ? fmt(k.expires_at) : <span style={s.dash}>never</span>}</td>
                  <td style={s.td}>
                    <span style={{ ...s.pill, background: st.bg, color: st.color }}>{state}</span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {!dead && state !== 'EXPIRED' && (
                      <button style={s.btnTiny} disabled={busyId === k.id}
                              onClick={() => handleExpire(k)}>Expire now</button>
                    )}
                    {!dead && (
                      <button style={{ ...s.btnTiny, ...s.btnDanger }} disabled={busyId === k.id}
                              onClick={() => handleRevoke(k)}>Revoke</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h2 style={s.h2}>Recent redemptions</h2>
      <div style={s.panel}>
        <table style={s.table}>
          <thead><tr>
            <th style={s.th}>When</th><th style={s.th}>Participant</th>
            <th style={s.th}>CTS ID</th><th style={s.th}>Code</th>
          </tr></thead>
          <tbody>
            {ledger.length === 0 && <tr><td style={s.td} colSpan={4}>No redemptions yet.</td></tr>}
            {ledger.map(r => (
              <tr key={r.id} style={s.tr}>
                <td style={s.td}>{fmt(r.redeemed_at)}</td>
                <td style={s.td}>{r.participants?.full_name ?? '—'}</td>
                <td style={{ ...s.td, ...s.mono }}>{r.participants?.cts_id ?? '—'}</td>
                <td style={{ ...s.td, ...s.mono }}>{r.cohort_invite_code?.code ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function fmt(v) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—'
    : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const s = {
  page: { padding: '4px 2px 40px', fontFamily: "'DM Sans', sans-serif" },
  loading: { padding: '40px', color: '#8BA0B8', fontSize: '13px' },
  topRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' },
  topActions: { display: 'flex', gap: '8px', alignItems: 'center' },
  title: { fontSize: '20px', fontWeight: '500', color: '#0D1B2A', margin: 0 },
  sub: { fontSize: '13px', color: '#8BA0B8', margin: '5px 0 0' },
  h2: { fontSize: '14px', fontWeight: '500', color: '#0D1B2A', margin: '26px 0 10px' },

  warnBox: { background: '#FDF3E3', border: '1px solid #F0DFC0', color: '#7A5510', borderRadius: '10px', padding: '11px 14px', fontSize: '12px', lineHeight: '1.6', marginBottom: '14px' },
  errorBox: { background: '#FAECE7', color: '#993C1D', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', marginBottom: '14px' },

  panel: { background: '#fff', border: '1px solid #E8EFF6', borderRadius: '12px', overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { textAlign: 'left', padding: '11px 14px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#8BA0B8', borderBottom: '1px solid #E8EFF6', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #F2F6FB' },
  td: { padding: '10px 14px', color: '#2A3D52' },
  mono: { fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em' },
  dash: { color: '#C3D0DE' },
  pill: { display: 'inline-block', padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: '600', letterSpacing: '0.05em' },

  label: { display: 'block', fontSize: '11px', fontWeight: '600', color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '12px', marginBottom: '5px' },
  hint: { fontSize: '11px', color: '#8BA0B8', marginTop: '5px', lineHeight: '1.5' },
  input: { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #CBD8E6', borderRadius: '8px', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", color: '#0D1B2A', outline: 'none' },
  codeInput: { fontFamily: "'DM Mono', monospace", letterSpacing: '0.12em' },
  codeRow: { display: 'flex', gap: '8px' },
  inlineInput: { width: '100%', maxWidth: '210px', padding: '5px 7px', border: '1px solid transparent', borderRadius: '6px', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", color: '#2A3D52', background: '#F6F8FB', outline: 'none' },
  select: { padding: '9px 11px', border: '1px solid #CBD8E6', borderRadius: '8px', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", color: '#0D1B2A', background: '#fff' },
  twoUp: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },

  btnPrimary: { padding: '9px 15px', background: '#0D1B2A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  btnGhost: { padding: '9px 15px', background: '#fff', color: '#4A6080', border: '1px solid #CBD8E6', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' },
  btnTiny: { padding: '5px 9px', background: '#fff', color: '#4A6080', border: '1px solid #CBD8E6', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginLeft: '6px' },
  btnDanger: { color: '#993C1D', borderColor: '#E9C9BE' },

  modal: { position: 'fixed', inset: 0, background: 'rgba(13,27,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, padding: '20px' },
  modalCard: { background: '#fff', borderRadius: '14px', padding: '26px 28px', width: '100%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '16px', fontWeight: '500', color: '#0D1B2A' },
  modalActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '22px' },
}
