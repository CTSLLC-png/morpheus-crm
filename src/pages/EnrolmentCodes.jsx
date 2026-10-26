// src/pages/EnrolmentCodes.jsx
// ── Nguzo OS — staff: issue and manage enrolment codes ─────────
//
// Staff see the real state of a code (live / expired / revoked / used up)
// because they need it to run a program. A person redeeming one never does:
// redeem_cohort_invite() answers "That enrolment code is not valid." for all
// four. Nothing on this screen is reachable by a redeemer — cohort_invite_code
// has no participant, vendor or anon SELECT policy.
//
// A code is a bearer secret, so it is shown in full here and nowhere else.

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import {
  listInviteCodes, issueInviteCode, updateInviteCode, revokeInviteCode,
  expireInviteCodeNow, generateInviteCode, codeState,
} from '../lib/enrolment.js'

const STATE_STYLE = {
  Live:      { bg: '#E1F5EE', color: '#0F6E56' },
  Expired:   { bg: '#FAEEDA', color: '#854F0B' },
  'Used up': { bg: '#F1EFE8', color: '#5F5E5A' },
  Revoked:   { bg: '#FAECE7', color: '#993C1D' },
}

function fmt(v) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function EnrolmentCodes({ cohorts = [] }) {
  const { user } = useAuth()
  const [codes, setCodes]     = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [error, setError]     = useState(null)
  const [notice, setNotice]   = useState(null)
  const [busy, setBusy]       = useState(false)
  const [filter, setFilter]   = useState('')

  const [form, setForm] = useState({ cohortId: '', code: '', label: '', maxUses: '', expiresAt: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const [editing, setEditing] = useState(null)   // code id
  const [edit, setEdit] = useState({ label: '', maxUses: '', expiresAt: '' })

  function startEdit(c) {
    setEditing(c.id)
    setEdit({
      label:     c.label ?? '',
      maxUses:   c.max_uses ?? '',
      // <input type="date"> wants YYYY-MM-DD.
      expiresAt: c.expires_at ? new Date(c.expires_at).toISOString().slice(0, 10) : '',
    })
  }

  async function saveEdit(id) {
    setError(null); setNotice(null)
    try {
      const updated = await updateInviteCode(id, {
        label:     edit.label,
        maxUses:   edit.maxUses === '' ? null : edit.maxUses,
        expiresAt: edit.expiresAt ? new Date(edit.expiresAt).toISOString() : null,
      })
      setCodes(prev => prev.map(c => (c.id === id ? { ...c, ...updated } : c)))
      setEditing(null)
      setNotice('Code updated.')
    } catch (e) {
      setError(e.message)
    }
  }

  const reload = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      setCodes(await listInviteCodes(filter || null))
    } catch (e) {
      // "We could not ask" must not look like "there are no codes".
      setLoadError(e.message ?? 'Could not load enrolment codes.')
      setCodes([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { reload() }, [reload])

  async function handleIssue(e) {
    e.preventDefault()
    setBusy(true); setError(null); setNotice(null)
    try {
      if (!form.cohortId) throw new Error('Choose the cohort this code enrols into.')
      const created = await issueInviteCode({
        cohortId:  form.cohortId,
        code:      form.code || generateInviteCode(),
        label:     form.label,
        maxUses:   form.maxUses,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        createdBy: user?.id ?? null,
      })
      setCodes(prev => [created, ...prev.filter(c => c.id !== created.id)])
      setNotice(`Code ${created.code} issued. Hand it to the participant directly — it is a password for this cohort.`)
      setForm({ cohortId: form.cohortId, code: '', label: '', maxUses: '', expiresAt: '' })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function act(fn, id, successText) {
    setError(null); setNotice(null)
    try {
      const updated = await fn(id)
      setCodes(prev => prev.map(c => (c.id === id ? { ...c, ...updated } : c)))
      setNotice(successText)
    } catch (e) {
      setError(e.message)
    }
  }

  const cohortName = id => cohorts.find(c => c.id === id)?.name ?? id?.slice(0, 8)

  return (
    <div style={s.page}>
      <div style={s.headRow}>
        <div>
          <h1 style={s.title}>Enrolment codes</h1>
          <p style={s.sub}>
            A code lets someone register themselves straight into a cohort. Treat it as
            a shared password: hand it over directly, cap its uses, and revoke it when
            the intake closes.
          </p>
        </div>
      </div>

      {error  && <div style={s.errorBox} role="alert">{error}</div>}
      {notice && <div style={s.okBox} role="status">{notice}</div>}

      {/* ── Issue ── */}
      <div style={s.card}>
        <div style={s.cardTitle}>Issue a code</div>
        {cohorts.length === 0 && (
          <div style={s.hintBox}>
            There are no cohorts yet. Create one under Cohorts &amp; Reports first — a
            code has to point at a cohort.
          </div>
        )}
        <form onSubmit={handleIssue} style={s.form}>
          <div style={s.grid}>
            <div style={s.fg}>
              <label style={s.label} htmlFor="ec-cohort">Cohort <span style={s.req}>*</span></label>
              <select id="ec-cohort" style={s.input} value={form.cohortId} onChange={e => set('cohortId', e.target.value)}>
                <option value="">Select…</option>
                {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={s.fg}>
              <label style={s.label} htmlFor="ec-label">Label</label>
              <input id="ec-label" style={s.input} value={form.label}
                onChange={e => set('label', e.target.value)}
                placeholder="e.g. Albany LDSS referral sheet" />
            </div>
            <div style={s.fg}>
              <label style={s.label} htmlFor="ec-code">Code</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input id="ec-code" style={{ ...s.input, ...s.mono }} value={form.code}
                  onChange={e => set('code', e.target.value.toUpperCase())}
                  placeholder="leave blank to generate" spellCheck={false} />
                <button type="button" style={s.btn} onClick={() => set('code', generateInviteCode())}>
                  Generate
                </button>
              </div>
              <div style={s.hint}>8–32 characters, A–Z, 0–9 and hyphens.</div>
            </div>
            <div style={s.fg}>
              <label style={s.label} htmlFor="ec-max">Maximum uses</label>
              <input id="ec-max" style={s.input} type="number" min="1" value={form.maxUses}
                onChange={e => set('maxUses', e.target.value)} placeholder="unlimited" />
            </div>
            <div style={s.fg}>
              <label style={s.label} htmlFor="ec-expires">Expires</label>
              <input id="ec-expires" style={s.input} type="date" value={form.expiresAt}
                onChange={e => set('expiresAt', e.target.value)} />
            </div>
          </div>
          <button type="submit" style={s.btnPrimary} disabled={busy || cohorts.length === 0}>
            {busy ? 'Issuing…' : 'Issue code'}
          </button>
        </form>
      </div>

      {/* ── List ── */}
      <div style={{ ...s.card, marginTop: '14px' }}>
        <div style={s.listHead}>
          <div style={s.cardTitle}>Codes ({codes.length})</div>
          <select style={{ ...s.input, width: 'auto' }} value={filter} onChange={e => setFilter(e.target.value)}
            aria-label="Filter by cohort">
            <option value="">All cohorts</option>
            {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {loading && <div style={s.muted}>Loading…</div>}
        {!loading && loadError && <div style={s.errorBox}>Could not load enrolment codes: {loadError}</div>}
        {!loading && !loadError && codes.length === 0 && (
          <div style={s.muted}>No codes issued yet.</div>
        )}
        {!loading && !loadError && codes.length > 0 && (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Code</th><th style={s.th}>Cohort</th><th style={s.th}>Label</th>
                <th style={s.th}>Uses</th><th style={s.th}>Expires</th><th style={s.th}>State</th>
                <th style={s.th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {codes.map(c => {
                const state = codeState(c)
                const sty   = STATE_STYLE[state] ?? STATE_STYLE.Live
                return [
                  <tr key={c.id} style={s.tr}>
                    <td style={{ ...s.td, ...s.mono, fontWeight: 600 }}>{c.code}</td>
                    <td style={s.td}>{cohortName(c.cohort_id)}</td>
                    <td style={s.td}>{c.label ?? '—'}</td>
                    <td style={{ ...s.td, ...s.mono }}>{c.uses}{c.max_uses != null ? ` / ${c.max_uses}` : ''}</td>
                    <td style={s.td}>{fmt(c.expires_at)}</td>
                    <td style={s.td}>
                      <span style={{ ...s.pill, background: sty.bg, color: sty.color }}>{state}</span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {/* A revoked code is final: no edit, no un-revoke. Issue a
                          new one instead, so the ledger stays readable. */}
                      {!c.revoked_at && (
                        <>
                          <button type="button" style={s.btnSmall} onClick={() => (editing === c.id ? setEditing(null) : startEdit(c))}>
                            {editing === c.id ? 'Close' : 'Edit'}
                          </button>{' '}
                          <button type="button" style={s.btnSmall}
                            onClick={() => act(expireInviteCodeNow, c.id, `Code ${c.code} expired.`)}>
                            Expire now
                          </button>{' '}
                          <button type="button" style={{ ...s.btnSmall, ...s.btnDanger }}
                            onClick={() => act(revokeInviteCode, c.id, `Code ${c.code} revoked. It stops working on the next attempt.`)}>
                            Revoke
                          </button>
                        </>
                      )}
                    </td>
                  </tr>,
                  editing === c.id && (
                    <tr key={`${c.id}-edit`} style={s.tr}>
                      <td style={{ ...s.td, background: '#F7F9FC' }} colSpan={7}>
                        <div style={s.editRow}>
                          <div style={s.fg}>
                            <label style={s.label} htmlFor={`ec-edit-label-${c.id}`}>Label</label>
                            <input id={`ec-edit-label-${c.id}`} style={s.input} value={edit.label}
                              onChange={e => setEdit(p => ({ ...p, label: e.target.value }))} />
                          </div>
                          <div style={s.fg}>
                            <label style={s.label} htmlFor={`ec-edit-max-${c.id}`}>Maximum uses</label>
                            <input id={`ec-edit-max-${c.id}`} style={s.input} type="number" min="1" value={edit.maxUses}
                              onChange={e => setEdit(p => ({ ...p, maxUses: e.target.value }))}
                              placeholder="unlimited" />
                          </div>
                          <div style={s.fg}>
                            <label style={s.label} htmlFor={`ec-edit-exp-${c.id}`}>Expires</label>
                            <input id={`ec-edit-exp-${c.id}`} style={s.input} type="date" value={edit.expiresAt}
                              onChange={e => setEdit(p => ({ ...p, expiresAt: e.target.value }))} />
                          </div>
                          <button type="button" style={s.btn} onClick={() => saveEdit(c.id)}>Save</button>
                        </div>
                        <div style={{ ...s.hint, marginTop: '6px' }}>
                          The code string itself is never editable — rotating a code means
                          issuing a new one and revoking this one, so the ledger stays honest.
                        </div>
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={s.footNote}>
        Revoking takes effect immediately: the redemption function reads
        <code style={s.code}> revoked_at </code> inside the same transaction as the
        redemption, so there is no cache and no propagation delay. Past redemptions
        keep their audit trail — a code is never deleted.
      </div>
    </div>
  )
}

const s = {
  page:      { maxWidth: '980px', fontFamily: "'DM Sans', sans-serif" },
  headRow:   { marginBottom: '16px' },
  title:     { fontSize: '20px', fontWeight: 500, color: '#0D1B2A', marginBottom: '4px' },
  sub:       { fontSize: '13px', color: '#4A6080', lineHeight: '1.7', maxWidth: '620px' },
  card:      { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '16px', padding: '20px' },
  cardTitle: { fontSize: '11px', fontWeight: 600, color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' },
  listHead:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' },
  form:      { display: 'flex', flexDirection: 'column', gap: '14px' },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' },
  fg:        { display: 'flex', flexDirection: 'column', gap: '5px' },
  label:     { fontSize: '11px', fontWeight: 600, color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.06em' },
  req:       { color: '#993C1D' },
  input:     { padding: '9px 11px', border: '1px solid #CBD8E6', borderRadius: '8px', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", color: '#0D1B2A', background: '#fff', width: '100%', boxSizing: 'border-box' },
  mono:      { fontFamily: "'DM Mono', monospace" },
  hint:      { fontSize: '11px', color: '#5D768A' },
  hintBox:   { background: '#FAEEDA', color: '#854F0B', borderRadius: '8px', padding: '10px 13px', fontSize: '12px', lineHeight: '1.6', marginBottom: '14px' },
  btn:       { padding: '8px 12px', border: '1px solid #CBD8E6', borderRadius: '8px', background: '#fff', color: '#0D1B2A', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' },
  btnSmall:  { padding: '4px 10px', border: '1px solid #CBD8E6', borderRadius: '6px', background: '#fff', color: '#4A6080', fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  btnDanger: { borderColor: '#E8C4B8', color: '#993C1D' },
  btnPrimary:{ padding: '9px 20px', border: 'none', borderRadius: '8px', background: '#0D1B2A', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: 'fit-content' },
  errorBox:  { background: '#FAECE7', color: '#993C1D', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', lineHeight: '1.5', marginBottom: '12px' },
  okBox:     { background: '#E1F5EE', color: '#0F6E56', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', lineHeight: '1.5', marginBottom: '12px' },
  muted:     { fontSize: '13px', color: '#5D768A', fontStyle: 'italic' },
  table:     { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:        { padding: '8px 12px', textAlign: 'left', fontWeight: 500, fontSize: '11px', color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #CBD8E6' },
  td:        { padding: '9px 12px', color: '#0D1B2A' },
  tr:        { borderBottom: '1px solid #F0F4F8' },
  pill:      { fontSize: '10px', fontWeight: 600, padding: '2px 9px', borderRadius: '20px', display: 'inline-block' },
  editRow:   { display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' },
  footNote:  { marginTop: '14px', fontSize: '11px', color: '#5D768A', lineHeight: '1.7', maxWidth: '680px' },
  code:      { fontFamily: "'DM Mono', monospace", background: '#F1EFE8', borderRadius: '4px', padding: '1px 4px' },
}
