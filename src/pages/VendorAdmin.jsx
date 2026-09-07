// src/pages/VendorAdmin.jsx
// ── Morpheus CRM — staff: vendor / funder / agency access ───────
//
// Create partner organisations, attach their users, and grant or revoke the
// cohorts they may see.
//
// Two things worth knowing before changing this screen:
//
// 1. WHAT ACTUALLY GRANTS ACCESS is the vendor_user row plus an unrevoked
//    vendor_cohort row. public.current_vendor_id() and vendor_cohort_ids()
//    read those directly, so every revocation below takes effect on the
//    partner's very next query — there is no cached role, no token to expire
//    and no sign-out to wait for. app_metadata.role = 'vendor' decides which
//    shell they land in; it does not decide what they can read.
//
// 2. USERS ARE ATTACHED BY ID, not by email. auth.users is not readable with
//    the anon key — correctly — and adding a "look up this email" endpoint
//    would be a user-enumeration oracle. The operator pastes the user id from
//    the Supabase dashboard.

import { useEffect, useState } from 'react'
import { getCohortOverview } from '../lib/db.js'
import {
  listVendors, createVendor, setVendorStatus,
  listVendorUsers, addVendorUser, removeVendorUser,
  listVendorCohorts, grantVendorCohort, revokeVendorCohort,
  VENDOR_KINDS,
} from '../lib/access.js'

const KIND_HELP = {
  VENDOR:   'A supplier or delivery partner.',
  FUNDER:   'Pays for places and needs outcome reporting.',
  AGENCY:   'Refers participants and follows their progress.',
  FACILITY: 'Hosts delivery on site.',
}

export default function VendorAdmin({ staffProfileId = null }) {
  const [vendors, setVendors]   = useState([])
  const [cohorts, setCohorts]   = useState([])
  const [selected, setSelected] = useState(null)     // vendor row
  const [users, setUsers]       = useState([])
  const [grants, setGrants]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  const [draft, setDraft]     = useState({ name: '', slug: '', kind: 'FUNDER', contactEmail: '', notes: '' })
  const [newUserId, setNewUserId] = useState('')
  const [grantCohortId, setGrantCohortId] = useState('')

  useEffect(() => { reload() }, [])

  async function reload() {
    setLoading(true); setError(null)
    try {
      const [v, c] = await Promise.all([listVendors(), getCohortOverview()])
      setVendors(v); setCohorts(c ?? [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function select(vendor) {
    setSelected(vendor); setError(null)
    setUsers([]); setGrants([])
    try {
      const [u, g] = await Promise.all([listVendorUsers(vendor.id), listVendorCohorts(vendor.id)])
      setUsers(u); setGrants(g)
    } catch (e) { setError(e.message) }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const created = await createVendor(draft)
      setVendors(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setShowCreate(false)
      setDraft({ name: '', slug: '', kind: 'FUNDER', contactEmail: '', notes: '' })
      await select(created)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function handleStatus(vendor, status) {
    if (status === 'SUSPENDED' && !window.confirm(
      `Suspend ${vendor.name}? Every user of this organisation loses access immediately.`
    )) return
    setBusy(true); setError(null)
    try {
      await setVendorStatus(vendor.id, status)
      setVendors(prev => prev.map(v => v.id === vendor.id ? { ...v, status } : v))
      setSelected(prev => prev?.id === vendor.id ? { ...prev, status } : prev)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function handleAddUser(e) {
    e.preventDefault()
    const id = newUserId.trim()
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      setError('That does not look like a user id. Copy it from Authentication → Users in Supabase.')
      return
    }
    setBusy(true); setError(null)
    try {
      const row = await addVendorUser(selected.id, id, staffProfileId)
      setUsers(prev => [...prev, row])
      setNewUserId('')
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function handleRemoveUser(userId) {
    if (!window.confirm('Remove this user from the organisation? They lose access immediately.')) return
    setBusy(true); setError(null)
    try {
      await removeVendorUser(selected.id, userId)
      setUsers(prev => prev.filter(u => u.user_id !== userId))
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function handleGrant(e) {
    e.preventDefault()
    if (!grantCohortId) return
    setBusy(true); setError(null)
    try {
      await grantVendorCohort(selected.id, grantCohortId, staffProfileId)
      setGrants(await listVendorCohorts(selected.id))
      setGrantCohortId('')
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function handleRevokeGrant(cohortId) {
    setBusy(true); setError(null)
    try {
      await revokeVendorCohort(selected.id, cohortId)
      setGrants(await listVendorCohorts(selected.id))
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const liveGrants    = grants.filter(g => !g.revoked_at)
  const grantable     = cohorts.filter(c => !liveGrants.some(g => g.cohort_id === c.id))

  if (loading) return <div style={s.loading}>Loading partner organisations…</div>

  return (
    <div style={s.page}>
      <div style={s.topRow}>
        <div>
          <h1 style={s.title}>Partner access</h1>
          <p style={s.sub}>Vendors, funders, referring agencies and host facilities. All access is read-only.</p>
        </div>
        <button style={s.btnPrimary} onClick={() => { setShowCreate(true); setError(null) }}>
          + New organisation
        </button>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {showCreate && (
        <div style={s.modal}>
          <form style={s.modalCard} onSubmit={handleCreate}>
            <div style={s.modalTitle}>New partner organisation</div>

            <label style={s.label}>Name</label>
            <input style={s.input} required value={draft.name}
                   onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                   placeholder="Albany County DSS" />

            <label style={s.label}>Slug</label>
            <input style={s.input} required value={draft.slug}
                   onChange={e => setDraft(d => ({ ...d, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                   placeholder="albany-dss" />

            <label style={s.label}>Kind</label>
            <select style={s.input} value={draft.kind}
                    onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))}>
              {VENDOR_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <div style={s.hint}>{KIND_HELP[draft.kind]}</div>

            <label style={s.label}>Contact email</label>
            <input style={s.input} type="email" value={draft.contactEmail}
                   onChange={e => setDraft(d => ({ ...d, contactEmail: e.target.value }))} />

            <label style={s.label}>Notes</label>
            <textarea style={{ ...s.input, minHeight: '64px' }} value={draft.notes}
                      onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />

            <div style={s.modalActions}>
              <button type="button" style={s.btnGhost} onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" style={s.btnPrimary} disabled={busy}>
                {busy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={s.split}>
        <div style={s.list}>
          {vendors.length === 0 && <div style={s.listEmpty}>No partner organisations yet.</div>}
          {vendors.map(v => (
            <div key={v.id}
                 style={{ ...s.listItem, ...(selected?.id === v.id ? s.listItemActive : {}) }}
                 onClick={() => select(v)}>
              <div style={s.listName}>{v.name}</div>
              <div style={s.listMeta}>
                {v.kind}
                <span style={{
                  ...s.dot,
                  background: v.status === 'ACTIVE' ? '#5DCAA5' : '#D9A06B',
                }} />
                {v.status}
              </div>
            </div>
          ))}
        </div>

        <div style={s.detail}>
          {!selected ? (
            <div style={s.empty}>Choose an organisation to manage its users and cohort access.</div>
          ) : (
            <>
              <div style={s.detailHead}>
                <div>
                  <div style={s.detailName}>{selected.name}</div>
                  <div style={s.detailMeta}>
                    {selected.kind} · {selected.slug}
                    {selected.contact_email ? ` · ${selected.contact_email}` : ''}
                  </div>
                </div>
                {selected.status === 'ACTIVE' ? (
                  <button style={{ ...s.btnGhost, ...s.btnDanger }} disabled={busy}
                          onClick={() => handleStatus(selected, 'SUSPENDED')}>Suspend</button>
                ) : (
                  <button style={s.btnGhost} disabled={busy}
                          onClick={() => handleStatus(selected, 'ACTIVE')}>Reactivate</button>
                )}
              </div>

              {selected.status !== 'ACTIVE' && (
                <div style={s.warnBox}>
                  This organisation is suspended. Its users can sign in but see nothing —
                  current_vendor_id() resolves active organisations only.
                </div>
              )}

              {/* ── Users ── */}
              <h2 style={s.h2}>Users</h2>
              <div style={s.panel}>
                {users.length === 0 && <div style={s.rowEmpty}>No users attached yet.</div>}
                {users.map(u => (
                  <div key={u.user_id} style={s.row}>
                    <span style={s.mono}>{u.user_id}</span>
                    <span style={s.rowRight}>
                      <span style={s.rowSub}>added {fmt(u.added_at)}</span>
                      <button style={{ ...s.btnTiny, ...s.btnDanger }} disabled={busy}
                              onClick={() => handleRemoveUser(u.user_id)}>Remove</button>
                    </span>
                  </div>
                ))}
              </div>
              <form style={s.addRow} onSubmit={handleAddUser}>
                <input style={{ ...s.input, ...s.mono }} value={newUserId}
                       onChange={e => setNewUserId(e.target.value)}
                       placeholder="Supabase user id (uuid)" />
                <button type="submit" style={s.btnGhost} disabled={busy || !newUserId.trim()}>Attach user</button>
              </form>
              <div style={s.hint}>
                Create the login first (Authentication → Users, or the account panel), then paste its
                id here. Attaching the user is what grants access — the role stamped on the account
                only decides which portal they land in.
              </div>

              {/* ── Cohort scope ── */}
              <h2 style={s.h2}>Cohort access</h2>
              <div style={s.panel}>
                {liveGrants.length === 0 && <div style={s.rowEmpty}>No cohorts granted.</div>}
                {liveGrants.map(g => (
                  <div key={g.cohort_id} style={s.row}>
                    <span>
                      {g.cohorts?.name ?? g.cohort_id}
                      <span style={s.rowSub}> · {g.cohorts?.program_source ?? '—'}</span>
                    </span>
                    <span style={s.rowRight}>
                      <span style={s.rowSub}>granted {fmt(g.granted_at)}</span>
                      <button style={{ ...s.btnTiny, ...s.btnDanger }} disabled={busy}
                              onClick={() => handleRevokeGrant(g.cohort_id)}>Revoke</button>
                    </span>
                  </div>
                ))}
              </div>
              <form style={s.addRow} onSubmit={handleGrant}>
                <select style={s.input} value={grantCohortId} onChange={e => setGrantCohortId(e.target.value)}>
                  <option value="">Choose a cohort…</option>
                  {grantable.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="submit" style={s.btnGhost} disabled={busy || !grantCohortId}>Grant access</button>
              </form>

              {grants.some(g => g.revoked_at) && (
                <>
                  <h2 style={s.h2}>Previously granted</h2>
                  <div style={s.panel}>
                    {grants.filter(g => g.revoked_at).map(g => (
                      <div key={g.cohort_id} style={{ ...s.row, color: '#8BA0B8' }}>
                        <span>{g.cohorts?.name ?? g.cohort_id}</span>
                        <span style={s.rowSub}>revoked {fmt(g.revoked_at)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={s.hint}>
                    Revoked grants are kept, not deleted — granting the same cohort again reinstates
                    this row rather than creating a second one.
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function fmt(v) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const s = {
  page: { padding: '4px 2px 40px', fontFamily: "'DM Sans', sans-serif" },
  loading: { padding: '40px', color: '#8BA0B8', fontSize: '13px' },
  topRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' },
  title: { fontSize: '20px', fontWeight: '500', color: '#0D1B2A', margin: 0 },
  sub: { fontSize: '13px', color: '#8BA0B8', margin: '5px 0 0' },
  h2: { fontSize: '13px', fontWeight: '600', color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '22px 0 8px' },

  errorBox: { background: '#FAECE7', color: '#993C1D', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', marginBottom: '14px' },
  warnBox: { background: '#FDF3E3', border: '1px solid #F0DFC0', color: '#7A5510', borderRadius: '10px', padding: '11px 14px', fontSize: '12px', lineHeight: '1.6', marginTop: '12px' },

  split: { display: 'flex', gap: '18px', alignItems: 'flex-start', flexWrap: 'wrap' },
  list: { width: '250px', flexShrink: 0, background: '#fff', border: '1px solid #E8EFF6', borderRadius: '12px', overflow: 'hidden' },
  listEmpty: { padding: '18px 16px', fontSize: '13px', color: '#8BA0B8' },
  listItem: { padding: '11px 14px', borderBottom: '1px solid #F2F6FB', cursor: 'pointer' },
  listItemActive: { background: '#F2F8F6', boxShadow: 'inset 3px 0 0 #5DCAA5' },
  listName: { fontSize: '13px', color: '#0D1B2A', fontWeight: '500' },
  listMeta: { fontSize: '11px', color: '#8BA0B8', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' },
  dot: { width: '6px', height: '6px', borderRadius: '999px', display: 'inline-block' },

  detail: { flex: 1, minWidth: '340px' },
  detailHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
  detailName: { fontSize: '17px', fontWeight: '500', color: '#0D1B2A' },
  detailMeta: { fontSize: '12px', color: '#8BA0B8', marginTop: '4px' },
  empty: { background: '#fff', border: '1px solid #E8EFF6', borderRadius: '12px', padding: '40px 28px', textAlign: 'center', fontSize: '13px', color: '#8BA0B8' },

  panel: { background: '#fff', border: '1px solid #E8EFF6', borderRadius: '12px', overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 14px', borderBottom: '1px solid #F2F6FB', fontSize: '13px', color: '#2A3D52' },
  rowRight: { display: 'flex', alignItems: 'center', gap: '10px', whiteSpace: 'nowrap' },
  rowSub: { fontSize: '11px', color: '#8BA0B8' },
  rowEmpty: { padding: '14px', fontSize: '13px', color: '#8BA0B8' },
  addRow: { display: 'flex', gap: '8px', marginTop: '8px' },
  mono: { fontFamily: "'DM Mono', monospace", fontSize: '12px', letterSpacing: '0.02em' },

  label: { display: 'block', fontSize: '11px', fontWeight: '600', color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '12px', marginBottom: '5px' },
  hint: { fontSize: '11px', color: '#8BA0B8', marginTop: '6px', lineHeight: '1.6' },
  input: { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #CBD8E6', borderRadius: '8px', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", color: '#0D1B2A', outline: 'none', background: '#fff' },

  btnPrimary: { padding: '9px 15px', background: '#0D1B2A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' },
  btnGhost: { padding: '9px 15px', background: '#fff', color: '#4A6080', border: '1px solid #CBD8E6', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' },
  btnTiny: { padding: '5px 9px', background: '#fff', color: '#4A6080', border: '1px solid #CBD8E6', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  btnDanger: { color: '#993C1D', borderColor: '#E9C9BE' },

  modal: { position: 'fixed', inset: 0, background: 'rgba(13,27,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, padding: '20px' },
  modalCard: { background: '#fff', borderRadius: '14px', padding: '26px 28px', width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '16px', fontWeight: '500', color: '#0D1B2A' },
  modalActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '22px' },
}
