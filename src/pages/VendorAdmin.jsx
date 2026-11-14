// src/pages/VendorAdmin.jsx
// ── Nguzo OS — staff: partner organisation access ───────────────
//
// Create partner organisations, attach their users, grant and withdraw
// cohort scope. All of it gated at the database by the vendor_*_staff_all
// policies; nothing here authorises anybody by itself.
//
// WHY THERE IS NO "FIND USER BY EMAIL" BOX
//
// An email -> user_id lookup is a user-enumeration oracle. Anyone who reached
// it would learn which email addresses hold accounts in a system whose users
// are justice-involved people in a reentry program. The operator copies the
// account's user id out of the Supabase dashboard and pastes it. That is
// slower on purpose and it is not an oversight — do not add the lookup.

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import {
  listVendors, createVendor, setVendorStatus,
  listVendorUsers, attachVendorUser, detachVendorUser,
  listVendorCohortGrants, grantVendorCohort, revokeVendorCohort,
  VENDOR_KINDS, slugify,
} from '../lib/vendorAdmin.js'

function fmt(v) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function VendorAdmin({ cohorts = [] }) {
  // Granting partner access is a disclosure decision about an outside
  // organisation, so it is super-admin only — enforced in RLS, mirrored here
  // so a trainer is not shown controls whose writes the database refuses.
  // Revoking stays available to every trainer: cutting access off is the
  // safety-increasing direction and must not wait on one person.
  const { user, isAdmin } = useAuth()
  const [vendors, setVendors]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [selected, setSelected] = useState(null)   // vendor id
  const [error, setError]       = useState(null)
  const [notice, setNotice]     = useState(null)
  const [busy, setBusy]         = useState(false)

  const [form, setForm] = useState({ name: '', slug: '', kind: 'VENDOR', contactEmail: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const reload = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      setVendors(await listVendors())
    } catch (e) {
      setLoadError(e.message ?? 'Could not load partner organisations.')
      setVendors([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  async function handleCreate(e) {
    e.preventDefault()
    setBusy(true); setError(null); setNotice(null)
    try {
      const v = await createVendor({
        name: form.name, slug: form.slug, kind: form.kind, contactEmail: form.contactEmail,
      })
      setVendors(prev => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)))
      setSelected(v.id)
      setNotice(`${v.name} created. Attach its users and grant it cohorts below.`)
      setForm({ name: '', slug: '', kind: 'VENDOR', contactEmail: '' })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleStatus(v) {
    const next = v.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    setError(null); setNotice(null)

    // Suspension records why, because it is an access decision about an
    // outside organisation and will be asked about later. The server rejects
    // a blank reason, so collect it here rather than letting the call fail.
    let reason = null
    if (next === 'SUSPENDED') {
      reason = window.prompt(`Why is ${v.name} being suspended?`)
      if (reason === null) return               // cancelled
      if (!reason.trim()) { setError('A reason is required to suspend a partner.'); return }
    }

    try {
      await setVendorStatus(v.id, next, reason)
      setVendors(prev => prev.map(x => (x.id === v.id ? { ...x, status: next } : x)))
      setNotice(next === 'SUSPENDED'
        ? `${v.name} suspended. Every one of its users loses every row on their next request.`
        : `${v.name} reactivated.`)
    } catch (e) {
      setError(e.message)
    }
  }

  const current = vendors.find(v => v.id === selected) ?? null

  return (
    <div style={s.page}>
      <h1 style={s.title}>Partner access</h1>
      <p style={s.sub}>
        Partner organisations — vendors, funders, agencies and facilities — get a
        view-only portal showing the cohorts you grant them. They never see a
        participant&rsquo;s date of birth, case number or any program gate result.
      </p>

      {!isAdmin && (
        <div style={s.okBox} role="status">
          You can review partners and withdraw access — suspend an organisation,
          remove one of its users, or take back a cohort. Creating a partner and
          granting new access is restricted to a super admin.
        </div>
      )}

      {error  && <div style={s.errorBox} role="alert">{error}</div>}
      {notice && <div style={s.okBox} role="status">{notice}</div>}

      {/* ── Create ── Granting direction: super admin only. */}
      {isAdmin && (
      <div style={s.card}>
        <div style={s.cardTitle}>Add a partner organisation</div>
        <form onSubmit={handleCreate} style={s.form}>
          <div style={s.grid}>
            <div style={s.fg}>
              <label style={s.label} htmlFor="va-name">Name <span style={s.req}>*</span></label>
              <input id="va-name" style={s.input} required value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Albany County DSS" />
            </div>
            <div style={s.fg}>
              <label style={s.label} htmlFor="va-slug">Slug</label>
              <input id="va-slug" style={{ ...s.input, ...s.mono }} value={form.slug}
                onChange={e => set('slug', e.target.value.toLowerCase())}
                placeholder={slugify(form.name) || 'albany-county-dss'} />
              <div style={s.hint}>Lower-case letters, digits and hyphens. Generated from the name if left blank.</div>
            </div>
            <div style={s.fg}>
              <label style={s.label} htmlFor="va-kind">Kind</label>
              <select id="va-kind" style={s.input} value={form.kind} onChange={e => set('kind', e.target.value)}>
                {VENDOR_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div style={s.fg}>
              <label style={s.label} htmlFor="va-email">Contact email</label>
              <input id="va-email" style={s.input} type="email" value={form.contactEmail}
                onChange={e => set('contactEmail', e.target.value)}
                placeholder="program.contact@example.gov" />
            </div>
          </div>
          <button type="submit" style={s.btnPrimary} disabled={busy}>
            {busy ? 'Creating…' : 'Create organisation'}
          </button>
        </form>
      </div>
      )}

      {/* ── List ── */}
      <div style={{ ...s.card, marginTop: '14px' }}>
        <div style={s.cardTitle}>Organisations ({vendors.length})</div>
        {loading && <div style={s.muted}>Loading…</div>}
        {!loading && loadError && <div style={s.errorBox}>Could not load partner organisations: {loadError}</div>}
        {!loading && !loadError && vendors.length === 0 && <div style={s.muted}>No partner organisations yet.</div>}
        {!loading && !loadError && vendors.length > 0 && (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Name</th><th style={s.th}>Slug</th><th style={s.th}>Kind</th>
                <th style={s.th}>Status</th><th style={s.th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {vendors.map(v => (
                <tr key={v.id} style={s.tr}>
                  <td style={{ ...s.td, fontWeight: 500 }}>{v.name}</td>
                  <td style={{ ...s.td, ...s.mono }}>{v.slug}</td>
                  <td style={s.td}>{v.kind}</td>
                  <td style={s.td}>
                    <span style={{ ...s.pill, background: v.status === 'ACTIVE' ? '#E1F5EE' : '#FAECE7', color: v.status === 'ACTIVE' ? '#0F6E56' : '#993C1D' }}>
                      {v.status}
                    </span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" style={s.btnSmall}
                      onClick={() => setSelected(selected === v.id ? null : v.id)}>
                      {selected === v.id ? 'Close' : 'Manage'}
                    </button>{' '}
                    <button type="button" style={{ ...s.btnSmall, ...(v.status === 'ACTIVE' ? s.btnDanger : {}) }}
                      onClick={() => handleStatus(v)}>
                      {v.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {current && (
        <VendorDetail
          key={current.id}
          vendor={current}
          cohorts={cohorts}
          actorId={user?.id ?? null}
          onError={setError}
          onNotice={setNotice}
        />
      )}

      <div style={s.footNote}>
        Withdrawing a cohort takes effect immediately: every partner read is scoped by
        <code style={s.code}> vendor_cohort_ids() </code>, which filters on
        <code style={s.code}> revoked_at IS NULL </code> at query time. Suspending the
        organisation does the same for all of its cohorts at once, because
        <code style={s.code}> current_vendor_id() </code> only resolves ACTIVE partners.
      </div>
    </div>
  )
}

// ── One organisation: users and cohort scope ────────────────────

function VendorDetail({ vendor, cohorts, actorId, onError, onNotice }) {
  // Same split as the parent: attaching a user and granting a cohort are the
  // granting direction and are super-admin only; detaching and revoking stay
  // open to trainers.
  const { isAdmin } = useAuth()
  const [users, setUsers]   = useState([])
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [userId, setUserId] = useState('')
  const [cohortId, setCohortId] = useState('')

  const reload = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const [u, g] = await Promise.all([
        listVendorUsers(vendor.id),
        listVendorCohortGrants(vendor.id),
      ])
      setUsers(u); setGrants(g)
    } catch (e) {
      setLoadError(e.message ?? 'Could not load this organisation.')
    } finally {
      setLoading(false)
    }
  }, [vendor.id])

  useEffect(() => { reload() }, [reload])

  async function addUser(e) {
    e.preventDefault()
    onError(null); onNotice(null)
    try {
      const row = await attachVendorUser(vendor.id, userId, actorId)
      setUsers(prev => [row, ...prev])
      setUserId('')
      onNotice('User attached. Their account still needs its role set to "vendor" by an administrator before the partner portal opens for them.')
    } catch (e) {
      onError(e.message)
    }
  }

  async function removeUser(id) {
    onError(null); onNotice(null)
    try {
      await detachVendorUser(vendor.id, id)
      setUsers(prev => prev.filter(u => u.user_id !== id))
      onNotice('User detached. Their next request resolves no partner organisation.')
    } catch (e) {
      onError(e.message)
    }
  }

  async function addCohort(e) {
    e.preventDefault()
    onError(null); onNotice(null)
    try {
      if (!cohortId) throw new Error('Choose a cohort to grant.')
      const row = await grantVendorCohort(vendor.id, cohortId, actorId)
      setGrants(prev => [row, ...prev.filter(g => g.cohort_id !== row.cohort_id)])
      setCohortId('')
      onNotice('Cohort granted.')
    } catch (e) {
      onError(e.message)
    }
  }

  async function regrantCohort(id) {
    onError(null); onNotice(null)
    try {
      // The primary key is (vendor_id, cohort_id), so re-granting clears
      // revoked_at on the existing row rather than adding a second one.
      const row = await grantVendorCohort(vendor.id, id, actorId)
      setGrants(prev => prev.map(g => (g.cohort_id === id ? { ...g, ...row } : g)))
      onNotice('Cohort granted again.')
    } catch (e) {
      onError(e.message)
    }
  }

  async function dropCohort(id) {
    onError(null); onNotice(null)
    try {
      const row = await revokeVendorCohort(vendor.id, id)
      setGrants(prev => prev.map(g => (g.cohort_id === id ? { ...g, ...row } : g)))
      onNotice('Cohort withdrawn. It disappears from their portal on their next request.')
    } catch (e) {
      onError(e.message)
    }
  }

  const cohortName = id => cohorts.find(c => c.id === id)?.name ?? id?.slice(0, 8)
  const liveGrants = grants.filter(g => !g.revoked_at)
  const grantable  = cohorts.filter(c => !liveGrants.some(g => g.cohort_id === c.id))

  return (
    <div style={{ ...s.card, marginTop: '14px', borderColor: '#0D1B2A' }}>
      <div style={s.cardTitle}>{vendor.name} — users and cohort scope</div>

      {loading && <div style={s.muted}>Loading…</div>}
      {!loading && loadError && <div style={s.errorBox}>{loadError}</div>}

      {!loading && !loadError && (
        <div style={s.twoCol}>
          {/* Users */}
          <div>
            <div style={s.subTitle}>Users ({users.length})</div>
            {isAdmin && (
              <>
                <form onSubmit={addUser} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  <input style={{ ...s.input, ...s.mono }} value={userId}
                    onChange={e => setUserId(e.target.value)}
                    placeholder="paste account user id (UUID)"
                    aria-label="Account user id" spellCheck={false} />
                  <button type="submit" style={s.btn}>Attach</button>
                </form>
                <div style={s.hint}>
                  Paste the account&rsquo;s user id from the Supabase dashboard. There is no
                  email lookup here on purpose: it would tell anyone who reached it which
                  addresses hold accounts.
                </div>
              </>
            )}
            <ul style={s.list}>
              {users.map(u => (
                <li key={u.user_id} style={s.listRow}>
                  <span style={{ ...s.mono, fontSize: '11px', flex: 1, wordBreak: 'break-all' }}>{u.user_id}</span>
                  <span style={s.hint}>{fmt(u.added_at)}</span>
                  <button type="button" style={{ ...s.btnSmall, ...s.btnDanger }}
                    onClick={() => removeUser(u.user_id)}>Detach</button>
                </li>
              ))}
              {users.length === 0 && <li style={s.muted}>No users attached.</li>}
            </ul>
          </div>

          {/* Cohort scope */}
          <div>
            <div style={s.subTitle}>Cohort scope ({liveGrants.length})</div>
            {isAdmin && (
              <form onSubmit={addCohort} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                <select style={s.input} value={cohortId} onChange={e => setCohortId(e.target.value)}
                  aria-label="Cohort to grant">
                  <option value="">Select a cohort…</option>
                  {grantable.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="submit" style={s.btn} disabled={grantable.length === 0}>Grant</button>
              </form>
            )}
            <ul style={s.list}>
              {grants.map(g => (
                <li key={g.cohort_id} style={s.listRow}>
                  <span style={{ flex: 1 }}>{cohortName(g.cohort_id)}</span>
                  {g.revoked_at ? (
                    <>
                      <span style={{ ...s.pill, background: '#F1EFE8', color: '#5F5E5A' }}>Withdrawn</span>
                      {/* Re-granting restores access, so it is the granting
                          direction and stays with a super admin. */}
                      {isAdmin && (
                        <button type="button" style={s.btnSmall}
                          onClick={() => regrantCohort(g.cohort_id)}>Re-grant</button>
                      )}
                    </>
                  ) : (
                    <button type="button" style={{ ...s.btnSmall, ...s.btnDanger }}
                      onClick={() => dropCohort(g.cohort_id)}>Withdraw</button>
                  )}
                </li>
              ))}
              {grants.length === 0 && <li style={s.muted}>No cohorts granted.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

const s = {
  page:      { maxWidth: '980px', fontFamily: "'DM Sans', sans-serif" },
  title:     { fontSize: '20px', fontWeight: 500, color: '#0D1B2A', marginBottom: '4px' },
  sub:       { fontSize: '13px', color: '#4A6080', lineHeight: '1.7', maxWidth: '640px', marginBottom: '16px' },
  card:      { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '16px', padding: '20px' },
  cardTitle: { fontSize: '11px', fontWeight: 600, color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' },
  subTitle:  { fontSize: '12px', fontWeight: 600, color: '#0D1B2A', marginBottom: '8px' },
  form:      { display: 'flex', flexDirection: 'column', gap: '14px' },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' },
  twoCol:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '22px' },
  fg:        { display: 'flex', flexDirection: 'column', gap: '5px' },
  label:     { fontSize: '11px', fontWeight: 600, color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.06em' },
  req:       { color: '#993C1D' },
  input:     { padding: '9px 11px', border: '1px solid #CBD8E6', borderRadius: '8px', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", color: '#0D1B2A', background: '#fff', width: '100%', boxSizing: 'border-box' },
  mono:      { fontFamily: "'DM Mono', monospace" },
  hint:      { fontSize: '11px', color: '#5D768A', lineHeight: '1.6' },
  btn:       { padding: '8px 12px', border: '1px solid #CBD8E6', borderRadius: '8px', background: '#fff', color: '#0D1B2A', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' },
  btnSmall:  { padding: '4px 10px', border: '1px solid #CBD8E6', borderRadius: '6px', background: '#fff', color: '#4A6080', fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  btnDanger: { borderColor: '#E8C4B8', color: '#993C1D' },
  btnPrimary:{ padding: '9px 20px', border: 'none', borderRadius: '8px', background: '#0D1B2A', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: 'fit-content' },
  errorBox:  { background: '#FAECE7', color: '#993C1D', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', lineHeight: '1.5', marginBottom: '12px' },
  okBox:     { background: '#E1F5EE', color: '#0F6E56', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', lineHeight: '1.5', marginBottom: '12px' },
  muted:     { fontSize: '13px', color: '#5D768A', fontStyle: 'italic', listStyle: 'none' },
  table:     { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:        { padding: '8px 12px', textAlign: 'left', fontWeight: 500, fontSize: '11px', color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #CBD8E6' },
  td:        { padding: '9px 12px', color: '#0D1B2A' },
  tr:        { borderBottom: '1px solid #F0F4F8' },
  pill:      { fontSize: '10px', fontWeight: 600, padding: '2px 9px', borderRadius: '20px', display: 'inline-block' },
  list:      { listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' },
  listRow:   { display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', background: '#F7F9FC', borderRadius: '8px', fontSize: '12px' },
  footNote:  { marginTop: '14px', fontSize: '11px', color: '#5D768A', lineHeight: '1.7', maxWidth: '700px' },
  code:      { fontFamily: "'DM Mono', monospace", background: '#F1EFE8', borderRadius: '4px', padding: '1px 4px' },
}
