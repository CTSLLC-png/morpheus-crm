// src/pages/AdminPanel.jsx
// ── Morpheus CRM — Staff Admin Panel (Sprint 3) ─────────────────
// Super admin only. Create participant and trainer accounts,
// manage staff profiles, view system stats.

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'

const ROLES = [
  { value: 'participant', label: 'Participant',  desc: 'Self-service portal, practice calls' },
  { value: 'trainer',     label: 'Trainer',      desc: 'Manage cohorts, run sessions, score calls' },
  { value: 'super_admin', label: 'Super Admin',  desc: 'Full access including this panel' },
  // A vendor login is inert until it is attached to a partner organisation in
  // Partner access — the role picks the portal, the vendor_user row grants the
  // data. create-morpheus-user deliberately does not create that row.
  { value: 'vendor',      label: 'Partner',      desc: 'Read-only portal — attach to an organisation in Partner access' },
]

const PROGRAM_SOURCES = [
  'LDSS Albany',
  'LDSS Schenectady',
  'Reentry / Incarcerated',
  'Direct Enrollment',
]

export default function AdminPanel() {
  const { user } = useAuth()
  const [tab, setTab]         = useState('accounts')
  const [staff, setStaff]     = useState([])
  const [authUsers, setAuthUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError]     = useState(null)
  const [success, setSuccess] = useState(null)

  const [form, setForm] = useState({
    email:          '',
    password:       '',
    role:           'participant',
    full_name:      '',
    title:          '',
    program_source: 'LDSS Albany',
  })

  useEffect(() => {
    loadStaff()
  }, [])

  async function loadStaff() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('staff_profiles')
        .select('*, auth_user:user_id(email)')
        .order('full_name')
      if (error) throw error
      setStaff(data ?? [])
    } catch(e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    setSuccess(null)

    try {
      // Call the Supabase Edge Function to create user
      // (bypasses anon key restriction on auth.admin)
      const { data, error: fnErr } = await supabase.functions.invoke('create-morpheus-user', {
        body: {
          email:          form.email,
          password:       form.password,
          role:           form.role,
          full_name:      form.full_name,
          title:          form.title || null,
          program_source: form.role === 'participant' ? form.program_source : null,
        },
      })

      if (fnErr) {
        // Surface the real error from the function body instead of the
        // generic "Edge Function returned a non-2xx status code".
        let msg = fnErr.message
        try {
          const ctx = await fnErr.context.json()
          if (ctx?.error) msg = ctx.error
        } catch { /* keep the generic message */ }
        throw new Error(msg)
      }
          if (data?.error) throw new Error(data.error)

      const kind = form.role === 'participant' ? 'Participant'
                 : form.role === 'vendor'      ? 'Partner' : 'Staff'
      setSuccess(
        `${kind} account created for ${form.email}` +
        (form.role === 'participant' ? ` · CTS ID: ${data.cts_id}` : '') +
        // A vendor login sees nothing until it is attached to an organisation.
        // Say so at the moment of creation, with the user id they will need to
        // paste into Partner access — auth.users is not client-readable, so
        // this response is the only place they can get it.
        (form.role === 'vendor'
          ? ` · Now attach user ${data.user_id} to an organisation in Partner access.`
          : '')
      )
      setForm({ email:'', password:'', role:'participant', full_name:'', title:'', program_source:'LDSS Albany' })
      if (form.role === 'trainer' || form.role === 'super_admin') loadStaff()
    } catch(e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>Admin panel</h1>
          <p style={s.sub}>Create accounts, manage staff, view system status.</p>
        </div>
        <div style={s.adminBadge}>Super admin</div>
      </div>

      <div style={s.tabRow}>
        {[
          { key:'accounts', label:'Create account' },
          { key:'staff',    label:'Staff directory' },
          { key:'roles',    label:'Account roles' },
          { key:'system',   label:'System status' },
        ].map(t => (
          <button key={t.key}
            style={{ ...s.tab, ...(tab === t.key ? s.tabActive : {}) }}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Create account ── */}
      {tab === 'accounts' && (
        <div style={s.card}>
          <div style={s.cardTitle}>Create Morpheus account</div>

          {/* Role selector */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'20px' }}>
            {ROLES.map(r => (
              <div key={r.value}
                style={{
                  ...s.roleCard,
                  ...(form.role === r.value ? s.roleCardActive : {}),
                }}
                onClick={() => set('role', r.value)}>
                <div style={s.roleLabel}>{r.label}</div>
                <div style={s.roleDesc}>{r.desc}</div>
              </div>
            ))}
          </div>

          <form onSubmit={handleCreate} style={s.form}>
            <div style={s.formGrid}>
              <div style={s.fg}>
                <label style={s.label}>Full name <span style={s.req}>*</span></label>
                <input style={s.input} required value={form.full_name}
                  onChange={e => set('full_name', e.target.value)}
                  placeholder="First and last name" />
              </div>
              {form.role !== 'participant' && (
                <div style={s.fg}>
                  <label style={s.label}>Job title</label>
                  <input style={s.input} value={form.title}
                    onChange={e => set('title', e.target.value)}
                    placeholder="e.g. Lead Trainer" />
                </div>
              )}
              {form.role === 'participant' && (
                <div style={s.fg}>
                  <label style={s.label}>Program source <span style={s.req}>*</span></label>
                  <select style={s.input} value={form.program_source}
                    onChange={e => set('program_source', e.target.value)}>
                    {PROGRAM_SOURCES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              )}
              <div style={s.fg}>
                <label style={s.label}>Email address <span style={s.req}>*</span></label>
                <input style={s.input} type="email" required value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="user@example.com" />
              </div>
              <div style={s.fg}>
                <label style={s.label}>Temporary password <span style={s.req}>*</span></label>
                <input style={s.input} type="password" required minLength={8}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder="Min 8 characters" />
              </div>
            </div>

            {error   && <div style={s.errorBox}>{error}</div>}
            {success && <div style={s.successBox}>{success}</div>}

            <div style={{ display:'flex', gap:'10px', marginTop:'4px' }}>
              <button type="submit" style={s.btnPrimary} disabled={creating}>
                {creating ? 'Creating…' : `Create ${ROLES.find(r => r.value === form.role)?.label.toLowerCase() ?? ''} account`}
              </button>
            </div>

            <div style={s.hint}>
              {form.role === 'participant'
                ? 'A CTS ID will be auto-generated. The participant should change their password on first login.'
                : form.role === 'vendor'
                ? 'This login sees nothing until you attach it to a partner organisation in Partner access. The role decides which portal they land in; the organisation membership decides what they can read.'
                : 'Staff account will have access to the trainer or admin portal immediately after creation.'}
            </div>
          </form>
        </div>
      )}

      {/* ── Staff directory ── */}
      {tab === 'staff' && (
        <div style={s.card}>
          <div style={s.cardTitle}>Staff directory ({staff.length})</div>
          {loading ? (
            <div style={{ color:'var(--color-text-tertiary)', fontSize:'13px' }}>Loading staff…</div>
          ) : (
            <div style={s.staffList}>
              {staff.map(sp => (
                <div key={sp.id} style={s.staffRow}>
                  <div style={s.staffAvatar}>
                    {sp.full_name.split(' ').map(n => n[0]).join('').slice(0,2)}
                  </div>
                  <div style={s.staffInfo}>
                    <div style={s.staffName}>{sp.full_name}</div>
                    <div style={s.staffMeta}>
                      {sp.title && <span>{sp.title}</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                    <span style={s.staffBadge}>Trainer</span>
                  </div>
                </div>
              ))}
              {staff.length === 0 && (
                <div style={{ color:'var(--color-text-tertiary)', fontSize:'13px', fontStyle:'italic' }}>
                  No staff profiles yet. Create accounts using the &ldquo;Create account&rdquo; tab.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Account roles ── */}
      {tab === 'roles' && <RoleHealth />}

      {/* ── System status ── */}
      {tab === 'system' && (
        <div style={s.card}>
          <div style={s.cardTitle}>System configuration</div>
          <SystemStatus />
        </div>
      )}
    </div>
  )
}

/**
 * Which role each account actually has, from the database's point of view.
 *
 * This exists because the role split was invisible: the app read
 * user_metadata, RLS read app_metadata, and nothing ever showed an operator
 * that the two disagreed — so accounts that could not read their own data
 * looked, from every screen, completely normal.
 *
 * The `app_metadata` column is the one that matters. `claimed` is
 * user_metadata, which the user can write to themselves; it is shown only so a
 * mismatch is legible, and must never be acted on.
 *
 * Backed by public.staff_user_role_health(), added in sql/0009. Until that
 * migration is applied the RPC does not exist, so the panel says so rather
 * than showing an error the operator cannot act on.
 */
function RoleHealth() {
  const [rows, setRows]   = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.rpc('staff_user_role_health').then(({ data, error }) => {
      if (error) setError(error.message)
      else setRows(data ?? [])
    })
  }, [])

  if (error) {
    return (
      <div style={s.card}>
        <div style={s.cardTitle}>Account roles</div>
        <div style={s.hint}>
          Not available yet. This panel needs <code>public.staff_user_role_health()</code>,
          which is added by <code>sql/0009_role_metadata.sql</code>. Apply that migration to
          turn it on.
          <div style={{ marginTop: '8px', opacity: 0.7 }}>{error}</div>
        </div>
      </div>
    )
  }
  if (!rows) return <div style={s.card}>Loading…</div>

  const unstamped = rows.filter(r => !r.app_metadata_role)
  const mismatched = rows.filter(r => r.app_metadata_role && r.claimed_role &&
                                      r.app_metadata_role !== r.claimed_role)

  return (
    <div style={s.card}>
      <div style={s.cardTitle}>Account roles</div>
      <div style={s.hint}>
        <strong>Enforced</strong> is <code>app_metadata</code> — the only role Row Level
        Security can see, and the only one that grants anything. <strong>Claimed</strong> is{' '}
        <code>user_metadata</code>, which the account holder can set on themselves; it is
        shown for diagnosis only. An account with no enforced role can sign in but will be
        sent to the enrolment screen.
      </div>

      {(unstamped.length > 0 || mismatched.length > 0) && (
        <div style={{ ...s.errorBox, background:'#FDF3E3', color:'#7A5510' }}>
          {unstamped.length > 0 && <div>{unstamped.length} account(s) have no enforced role.</div>}
          {mismatched.length > 0 && <div>{mismatched.length} account(s) claim a different role than they hold.</div>}
        </div>
      )}

      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead><tr>
            {['Email','Enforced','Claimed','Participant','Partner','Staff profile'].map(h => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.user_id} style={{ borderBottom:'1px solid #F2F6FB' }}>
                <td style={s.td}>{r.email}</td>
                <td style={s.td}>
                  {r.app_metadata_role
                    ? <strong>{r.app_metadata_role}</strong>
                    : <span style={{ color:'#993C1D' }}>none</span>}
                </td>
                <td style={{ ...s.td, color: r.claimed_role !== r.app_metadata_role ? '#BA7517' : '#8BA0B8' }}>
                  {r.claimed_role ?? '—'}
                </td>
                <td style={s.td}>{r.is_participant ? 'yes' : '—'}</td>
                <td style={s.td}>{r.is_vendor_user ? 'yes' : '—'}</td>
                <td style={s.td}>{r.is_staff_profile ? 'yes' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SystemStatus() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    async function check() {
      const start = Date.now()
      try {
        const { data, error } = await supabase
          .from('score_matrix_weights')
          .select('id')
          .limit(1)
        const latency = Date.now() - start
        setStatus({
          db: error ? 'error' : 'ok',
          latency,
          apiKey: await fetch('/api/claude').then(r => r.status === 405).catch(() => false),
          supabaseUrl: (import.meta.env.VITE_SUPABASE_URL || 'ymavrmekxiwdphdyteau.supabase.co').replace('https://','').split('.')[0],
        })
      } catch {
        setStatus({ db: 'error', latency: null, apiKey: false })
      }
    }
    check()
  }, [])

  if (!status) return <div style={{ fontSize:'13px', color:'var(--color-text-tertiary)' }}>Checking connections…</div>

  const checks = [
    { label: 'Supabase DB',        ok: status.db === 'ok',  detail: status.db === 'ok' ? `${status.latency}ms latency` : 'Connection failed' },
    { label: 'AI gateway (/api/claude)', ok: status.apiKey,  detail: status.apiKey ? 'Serverless proxy live (key server-side)' : 'Gateway unreachable' },
    { label: 'Supabase project',   ok: !!status.supabaseUrl, detail: status.supabaseUrl ?? 'Not configured' },
    { label: 'App domain',         ok: true,                 detail: window.location.host },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
      {checks.map(c => (
        <div key={c.label} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 14px', background:'var(--color-background-secondary)', borderRadius:'10px' }}>
          <div style={{ width:'8px', height:'8px', borderRadius:'50%', background: c.ok ? '#27C080' : '#E24B4A', flexShrink:0 }} />
          <span style={{ fontSize:'13px', fontWeight:500, color:'var(--color-text-primary)', flex:1 }}>{c.label}</span>
          <span style={{ fontSize:'12px', color:'var(--color-text-tertiary)', fontFamily:'monospace' }}>{c.detail}</span>
        </div>
      ))}
      <div style={{ marginTop:'8px', fontSize:'12px', color:'var(--color-text-tertiary)', lineHeight:'1.6' }}>
        Morpheus CRM v1.0 · Sprint 3 complete · morpheuscr.com
      </div>
    </div>
  )
}

const s = {
  page:       { maxWidth:'800px', fontFamily:"'DM Sans', sans-serif" },
  headerRow:  { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'18px' },
  title:      { fontSize:'20px', fontWeight:500, color:'var(--color-text-primary)', marginBottom:'3px' },
  sub:        { fontSize:'13px', color:'var(--color-text-secondary)' },
  adminBadge: { fontSize:'11px', fontWeight:600, padding:'4px 12px', borderRadius:'20px', background:'#EEEDFE', color:'#3C3489', letterSpacing:'0.04em' },
  tabRow:     { display:'flex', gap:'2px', marginBottom:'14px', background:'var(--color-background-secondary)', borderRadius:'10px', padding:'3px', width:'fit-content' },
  tab:        { padding:'6px 16px', border:'none', borderRadius:'8px', background:'transparent', color:'var(--color-text-secondary)', fontSize:'13px', fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" },
  tabActive:  { background:'var(--color-background-primary)', color:'var(--color-text-primary)', boxShadow:'0 1px 3px rgba(0,0,0,0.08)' },
  card:       { background:'var(--color-background-primary)', border:'1px solid #CBD8E6', borderRadius:'16px', padding:'22px' },
  cardTitle:  { fontSize:'11px', fontWeight:600, color:'var(--color-text-secondary)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'16px' },
  roleCard:   { border:'1px solid #CBD8E6', borderRadius:'10px', padding:'12px 14px', cursor:'pointer', transition:'all 0.15s' },
  roleCardActive: { border:'1.5px solid #0D1B2A', background:'var(--color-background-secondary)' },
  roleLabel:  { fontSize:'13px', fontWeight:600, color:'var(--color-text-primary)', marginBottom:'3px' },
  roleDesc:   { fontSize:'11px', color:'var(--color-text-tertiary)', lineHeight:'1.4' },
  form:       { display:'flex', flexDirection:'column', gap:'14px' },
  formGrid:   { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' },
  fg:         { display:'flex', flexDirection:'column', gap:'5px' },
  label:      { fontSize:'11px', fontWeight:600, color:'var(--color-text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' },
  req:        { color:'#993C1D' },
  input:      { padding:'9px 11px', border:'1px solid #CBD8E6', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans', sans-serif", color:'var(--color-text-primary)', background:'var(--color-background-primary)', width:'100%' },
  btnPrimary: { padding:'9px 20px', border:'none', borderRadius:'8px', background:'#0D1B2A', color:'#fff', fontSize:'13px', fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans', sans-serif", width:'fit-content' },
  errorBox:   { background:'#FAECE7', color:'#993C1D', borderRadius:'8px', padding:'10px 14px', fontSize:'13px', lineHeight:'1.5' },
  successBox: { background:'#E1F5EE', color:'#0F6E56', borderRadius:'8px', padding:'10px 14px', fontSize:'13px', lineHeight:'1.5', fontWeight:500 },
  hint:       { fontSize:'11px', color:'var(--color-text-tertiary)', lineHeight:'1.6', marginTop:'4px' },
  th:         { textAlign:'left', padding:'9px 12px', fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.07em', color:'#8BA0B8', borderBottom:'1px solid #E8EFF6', whiteSpace:'nowrap' },
  td:         { padding:'9px 12px', color:'var(--color-text-primary)', whiteSpace:'nowrap' },
  staffList:  { display:'flex', flexDirection:'column', gap:'8px' },
  staffRow:   { display:'flex', alignItems:'center', gap:'12px', padding:'10px 14px', background:'var(--color-background-secondary)', borderRadius:'10px' },
  staffAvatar:{ width:'36px', height:'36px', borderRadius:'50%', background:'#0D1B2A', color:'#5DCAA5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:600, flexShrink:0, fontFamily:'monospace' },
  staffInfo:  { flex:1 },
  staffName:  { fontSize:'13px', fontWeight:500, color:'var(--color-text-primary)' },
  staffMeta:  { fontSize:'11px', color:'var(--color-text-tertiary)', marginTop:'1px' },
  staffBadge: { fontSize:'10px', fontWeight:600, padding:'2px 9px', borderRadius:'10px', background:'#E6F1FB', color:'#0C447C' },
}
