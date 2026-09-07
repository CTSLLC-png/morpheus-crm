// src/pages/VendorShell.jsx
// ── Morpheus CRM — vendor / funder / agency portal ──────────────
//
// A view-only window onto the cohorts a vendor has been granted scope over.
// There is no form, no button that writes, and no route that leads to one.
//
// Everything rendered here comes from src/lib/vendor.js — read the header of
// that file before adding a panel. The short version:
//   * names and EmpowerCare status come from vendor_roster() and
//     vendor_empowercare_status() and from nowhere else;
//   * completion status is coarse on purpose, and WEEK_TWO_BLOCKED (the day-3
//     caller-authentication gate) is never shown, fetched or inferred here.

import { useEffect, useMemo, useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { loadVendorWorkspace } from '../lib/vendor.js'

const NAV = [
  { path: '/',            label: 'Roster' },
  { path: '/empowercare', label: 'EmpowerCare' },
  { path: '/cohorts',     label: 'Cohorts' },
]

// The three values vendor_empowercare_status() may return, and nothing else.
// If a fourth ever appears it renders as itself rather than being guessed at.
const COMPLETION_LABEL = {
  IN_PROGRESS: { text: 'In progress', bg: '#E6F1FB', color: '#0C447C' },
  COMPLETED:   { text: 'Completed',   bg: '#E1F5EE', color: '#0F6E56' },
  EXITED:      { text: 'Exited',      bg: '#F1EFE8', color: '#5F5E5A' },
}

export default function VendorShell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [data, setData]   = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    loadVendorWorkspace()
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  const current = NAV.find(n => n.path === location.pathname) ?? NAV[0]

  if (error) {
    return <div style={s.fullMsg}>Could not load your dashboard: {error}</div>
  }
  if (!data) {
    return <div style={s.fullMsg}>Loading…</div>
  }

  // An active vendor with no granted cohorts is a normal, temporary state —
  // say so instead of rendering three empty tables.
  const noScope = data.cohorts.length === 0

  return (
    <div style={s.wrap}>
      <aside style={s.side}>
        <div style={s.brand}>
          <span style={s.brandM}>M<span style={s.brandAccent}>.</span>orpheus</span>
          <div style={s.brandSub}>Partner portal</div>
        </div>

        <div style={s.vendorCard}>
          <div style={s.vendorName}>{data.vendor?.name ?? 'Your organisation'}</div>
          <div style={s.vendorKind}>{data.vendor?.kind ?? ''}</div>
        </div>

        <nav style={s.nav}>
          {NAV.map(item => (
            <div
              key={item.path}
              style={{ ...s.navItem, ...(item.path === current.path ? s.navActive : {}) }}
              onClick={() => navigate(item.path)}
            >
              {item.label}
            </div>
          ))}
        </nav>

        <div style={s.readOnly}>
          View only. Records are maintained by Certified Training Standards.
        </div>
      </aside>

      <main style={s.main}>
        <header style={s.top}>
          <div style={s.topTitle}>{current.label}</div>
          <div style={s.topRight}>
            <span style={s.topUser}>{user?.email}</span>
            <button style={s.signOut} onClick={() => signOut()}>Sign out</button>
          </div>
        </header>

        <div style={s.body}>
          {noScope ? (
            <EmptyScope />
          ) : (
            <Routes>
              <Route path="/"            element={<Roster data={data} />} />
              <Route path="/empowercare" element={<EmpowerCare data={data} />} />
              <Route path="/cohorts"     element={<Cohorts data={data} />} />
              <Route path="*"            element={<Roster data={data} />} />
            </Routes>
          )}
        </div>
      </main>
    </div>
  )
}

function EmptyScope() {
  return (
    <div style={s.empty}>
      <div style={s.emptyTitle}>No cohorts assigned yet</div>
      <div style={s.emptyBody}>
        Your organisation does not currently have access to any cohort.
        Certified Training Standards grants that access; contact your programme
        contact there if you were expecting to see participants here.
      </div>
    </div>
  )
}

// ── Roster ─────────────────────────────────────────────────────

function Roster({ data }) {
  const { roster, progress, credentials } = data

  const credsByParticipant = useMemo(() => {
    const m = new Map()
    for (const c of credentials) {
      if (!m.has(c.participant_id)) m.set(c.participant_id, [])
      m.get(c.participant_id).push(c)
    }
    return m
  }, [credentials])

  if (roster.length === 0) {
    return <div style={s.empty}><div style={s.emptyTitle}>No participants yet</div>
      <div style={s.emptyBody}>Nobody has enrolled in your cohorts so far.</div></div>
  }

  return (
    <>
      <SummaryRow items={[
        { label: 'Participants', value: new Set(roster.map(r => r.participant_id)).size },
        { label: 'Cohorts',      value: new Set(roster.map(r => r.cohort_id)).size },
        { label: 'Credentials issued', value: credentials.filter(c => c.status === 'ACTIVE').length },
      ]} />

      <div style={s.panel}>
        <table style={s.table}>
          <thead>
            <tr>
              <Th>Participant</Th><Th>Cohort</Th><Th>Enrolment</Th>
              <Th>Course progress</Th><Th>Credential</Th>
            </tr>
          </thead>
          <tbody>
            {roster.map(r => {
              const p = progress.byParticipant.get(r.participant_id)
              const creds = credsByParticipant.get(r.participant_id) ?? []
              const live = creds.find(c => c.status === 'ACTIVE')
              return (
                <tr key={`${r.participant_id}-${r.cohort_id}`} style={s.tr}>
                  <Td><strong>{r.full_name}</strong>
                    <div style={s.sub}>{r.participant_status}</div></Td>
                  <Td>{r.cohort_name}</Td>
                  <Td>
                    {r.enrollment_status ?? '—'}
                    <div style={s.sub}>{fmtDate(r.enrolled_at)}</div>
                  </Td>
                  <Td><ProgressBar done={p?.completed ?? 0} total={progress.total} /></Td>
                  <Td>
                    {live
                      ? <span style={{ ...s.pill, background: '#E1F5EE', color: '#0F6E56' }}>
                          {live.credential_name}
                        </span>
                      : <span style={s.dash}>—</span>}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── EmpowerCare ────────────────────────────────────────────────

function EmpowerCare({ data }) {
  const { ec } = data

  if (ec.length === 0) {
    return <div style={s.empty}><div style={s.emptyTitle}>No EmpowerCare records</div>
      <div style={s.emptyBody}>
        None of the participants in your cohorts are enrolled in EmpowerCare.
      </div></div>
  }

  const totalHours = ec.reduce((n, r) => n + Number(r.contact_hours ?? 0), 0)

  return (
    <>
      <SummaryRow items={[
        { label: 'Enrolled',  value: ec.length },
        { label: 'Completed', value: ec.filter(r => r.completion_status === 'COMPLETED').length },
        { label: 'Contact hours', value: totalHours.toFixed(1) },
      ]} />

      <div style={s.panel}>
        <table style={s.table}>
          <thead>
            <tr>
              <Th>Participant</Th><Th>Days attended</Th><Th>Contact hours</Th>
              <Th>First</Th><Th>Last</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {ec.map(r => {
              const label = COMPLETION_LABEL[r.completion_status]
              return (
                <tr key={`${r.participant_id}-${r.cohort_id}`} style={s.tr}>
                  <Td><strong>{r.full_name}</strong></Td>
                  <Td>{r.days_attended ?? 0}</Td>
                  <Td>{Number(r.contact_hours ?? 0).toFixed(1)}</Td>
                  <Td>{fmtDate(r.first_attendance)}</Td>
                  <Td>{fmtDate(r.last_attendance)}</Td>
                  <Td>
                    <span style={{
                      ...s.pill,
                      background: label?.bg ?? '#F1EFE8',
                      color: label?.color ?? '#5F5E5A',
                    }}>
                      {label?.text ?? r.completion_status}
                    </span>
                    {r.completed_at && <div style={s.sub}>{fmtDate(r.completed_at)}</div>}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={s.note}>
        Attendance and completion are reported by Certified Training Standards.
        Detailed assessment outcomes are not part of partner reporting.
      </div>
    </>
  )
}

// ── Cohorts ────────────────────────────────────────────────────

function Cohorts({ data }) {
  const { cohorts, roster } = data
  const countByCohort = useMemo(() => {
    const m = new Map()
    for (const r of roster) m.set(r.cohort_id, (m.get(r.cohort_id) ?? 0) + 1)
    return m
  }, [roster])

  return (
    <div style={s.panel}>
      <table style={s.table}>
        <thead>
          <tr><Th>Cohort</Th><Th>Programme</Th><Th>Starts</Th><Th>Ends</Th><Th>Status</Th><Th>Participants</Th></tr>
        </thead>
        <tbody>
          {cohorts.map(c => (
            <tr key={c.id} style={s.tr}>
              <Td><strong>{c.name}</strong></Td>
              <Td>{c.program_source ?? '—'}</Td>
              <Td>{fmtDate(c.start_date)}</Td>
              <Td>{fmtDate(c.end_date)}</Td>
              <Td>{c.status}</Td>
              <Td>{countByCohort.get(c.id) ?? 0}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Bits ───────────────────────────────────────────────────────

function SummaryRow({ items }) {
  return (
    <div style={s.summaryRow}>
      {items.map(i => (
        <div key={i.label} style={s.stat}>
          <div style={s.statValue}>{i.value}</div>
          <div style={s.statLabel}>{i.label}</div>
        </div>
      ))}
    </div>
  )
}

function ProgressBar({ done, total }) {
  if (!total) return <span style={s.dash}>—</span>
  const pct = Math.min(100, Math.round((done / total) * 100))
  return (
    <div>
      <div style={s.barTrack}><div style={{ ...s.barFill, width: `${pct}%` }} /></div>
      <div style={s.sub}>{done} of {total} lessons</div>
    </div>
  )
}

const Th = ({ children }) => <th style={s.th}>{children}</th>
const Td = ({ children }) => <td style={s.td}>{children}</td>

function fmtDate(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const s = {
  wrap: { display: 'flex', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif", background: '#F6F8FB' },
  fullMsg: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0D1B2A', color: '#5DCAA5', fontFamily: "'DM Mono', monospace", fontSize: '14px', padding: '24px', textAlign: 'center' },

  side: { width: '236px', flexShrink: 0, background: '#0D1B2A', display: 'flex', flexDirection: 'column', padding: '22px 14px' },
  brand: { padding: '0 8px 18px' },
  brandM: { fontSize: '20px', color: '#fff', fontFamily: "'DM Mono', monospace", letterSpacing: '-0.5px' },
  brandAccent: { color: '#5DCAA5' },
  brandSub: { fontSize: '10px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '4px' },
  vendorCard: { background: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '11px 12px', marginBottom: '16px' },
  vendorName: { fontSize: '13px', color: '#fff', fontWeight: '500' },
  vendorKind: { fontSize: '10px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '3px' },
  nav: { flex: 1 },
  navItem: { padding: '9px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: 'rgba(255,255,255,0.55)', marginBottom: '2px' },
  navActive: { background: 'rgba(93,202,165,0.14)', color: '#5DCAA5' },
  readOnly: { fontSize: '11px', color: 'rgba(255,255,255,0.3)', lineHeight: '1.5', padding: '12px 10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' },

  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  top: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 28px', background: '#fff', borderBottom: '1px solid #E8EFF6' },
  topTitle: { fontSize: '16px', fontWeight: '500', color: '#0D1B2A' },
  topRight: { display: 'flex', alignItems: 'center', gap: '14px' },
  topUser: { fontSize: '12px', color: '#8BA0B8' },
  signOut: { background: 'none', border: '1px solid #CBD8E6', borderRadius: '7px', padding: '6px 11px', fontSize: '12px', color: '#4A6080', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  body: { padding: '24px 28px', overflowX: 'auto' },

  summaryRow: { display: 'flex', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' },
  stat: { background: '#fff', border: '1px solid #E8EFF6', borderRadius: '12px', padding: '14px 18px', minWidth: '132px' },
  statValue: { fontSize: '22px', fontWeight: '500', color: '#0D1B2A', fontFamily: "'DM Mono', monospace" },
  statLabel: { fontSize: '11px', color: '#8BA0B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '3px' },

  panel: { background: '#fff', border: '1px solid #E8EFF6', borderRadius: '12px', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { textAlign: 'left', padding: '11px 16px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#8BA0B8', borderBottom: '1px solid #E8EFF6', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #F2F6FB' },
  td: { padding: '12px 16px', color: '#2A3D52', verticalAlign: 'top' },
  sub: { fontSize: '11px', color: '#8BA0B8', marginTop: '3px' },
  dash: { color: '#C3D0DE' },
  pill: { display: 'inline-block', padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: '500' },

  barTrack: { width: '112px', height: '6px', borderRadius: '999px', background: '#E8EFF6', overflow: 'hidden' },
  barFill: { height: '100%', background: '#5DCAA5' },

  empty: { background: '#fff', border: '1px solid #E8EFF6', borderRadius: '12px', padding: '40px 32px', textAlign: 'center' },
  emptyTitle: { fontSize: '15px', fontWeight: '500', color: '#0D1B2A', marginBottom: '8px' },
  emptyBody: { fontSize: '13px', color: '#4A6080', lineHeight: '1.6', maxWidth: '460px', margin: '0 auto' },

  note: { marginTop: '14px', fontSize: '12px', color: '#8BA0B8', lineHeight: '1.6' },
}
