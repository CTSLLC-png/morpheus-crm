// src/pages/VendorShell.jsx
// ── Nguzo OS — partner (vendor / funder / agency) portal ───────
//
// A view-only window onto the cohorts a partner organisation has been granted
// scope over. There is no form, no button that writes, and no route that
// leads to one.
//
// Everything rendered here comes from src/lib/vendor.js. Read the header of
// that file before adding a panel. The short version:
//
//   * names and EmpowerCare status come from vendor_roster() and
//     vendor_empowercare_status() and from nowhere else — never from
//     `participants`, `empowercare.enrollment` or `empowercare.credential`,
//     which carry dob, ldss_case_number, retain_until and revoked_reason and
//     have no vendor policy for exactly that reason;
//   * completion status is coarse on purpose. WEEK_TWO_BLOCKED — the day-3
//     caller-authentication gate failure — is never shown, never fetched and
//     never inferred here. Reporting a named compliance failure about a
//     justice-involved person to an outside agency is the worst thing this
//     screen could do.

import { useEffect, useMemo, useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { loadVendorWorkspace } from '../lib/vendor.js'
import { BARE_BUTTON, SkipLink } from '../components/a11y.jsx'

const NAV = [
  { path: '/',            label: 'Roster' },
  { path: '/empowercare', label: 'EmpowerCare' },
  { path: '/credentials', label: 'Credentials' },
  { path: '/cohorts',     label: 'Cohorts' },
]

// The three values vendor_empowercare_status() may return, and nothing else.
// A fourth would render as itself rather than being guessed at — guessing is
// how a coarse status turns back into a gate result.
const COMPLETION_LABEL = {
  IN_PROGRESS: { text: 'In progress', bg: '#E6F1FB', color: '#0C447C' },
  COMPLETED:   { text: 'Completed',   bg: '#E1F5EE', color: '#0F6E56' },
  EXITED:      { text: 'Exited',      bg: '#F1EFE8', color: '#5F5E5A' },
}

function fmtDate(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function VendorShell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [data, setData]       = useState(null)
  const [fatal, setFatal]     = useState(null)

  useEffect(() => {
    let cancelled = false
    loadVendorWorkspace()
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setFatal(e?.message ?? 'Unknown error') })
    return () => { cancelled = true }
  }, [])

  const current = NAV.find(n => (n.path === '/' ? location.pathname === '/' : location.pathname.startsWith(n.path))) ?? NAV[0]

  if (fatal)  return <div style={s.fullMsg}>Could not load your dashboard: {fatal}</div>
  if (!data)  return <div style={s.fullMsg}>Loading…</div>

  // An active partner with no granted cohorts is a normal, temporary state.
  // Say so rather than rendering four empty tables that read as a bug.
  const noScope = data.cohorts.length === 0 && !data.errors.roster

  return (
    <div style={s.wrap}>
      <SkipLink />
      <aside style={s.side}>
        <div style={s.brand}>
          <span style={s.brandM}>M<span style={s.brandAccent}>.</span>orpheus</span>
          <div style={s.brandSub}>Partner portal</div>
        </div>

        <div style={s.vendorCard}>
          <div style={s.vendorName}>{data.vendor?.name ?? 'Your organisation'}</div>
          <div style={s.vendorKind}>{data.vendor?.kind ?? ''}</div>
        </div>

        <nav style={s.nav} aria-label="Main">
          {NAV.map(item => {
            const active = item.path === current.path
            return (
              <button key={item.path} type="button"
                aria-current={active ? 'page' : undefined}
                style={{ ...BARE_BUTTON, ...s.navItem, ...(active ? s.navActive : {}), width: '100%' }}
                onClick={() => navigate(item.path)}>
                {item.label}
              </button>
            )
          })}
        </nav>

        <div style={s.readOnly}>
          View only. These records are maintained by Certified Training Standards.
        </div>
      </aside>

      <main style={s.main} id="main-content" tabIndex={-1}>
        <header style={s.top}>
          <div style={s.topTitle}>{current.label}</div>
          <div style={s.topRight}>
            <span style={s.topUser}>{user?.email}</span>
            <button type="button" style={s.signOut} onClick={() => signOut()}>Sign out</button>
          </div>
        </header>

        <div style={s.body}>
          <ReadNotices errors={data.errors} />
          {noScope ? <EmptyScope /> : (
            <Routes>
              <Route path="/"            element={<Roster data={data} />} />
              <Route path="/empowercare" element={<EmpowerCare data={data} />} />
              <Route path="/credentials" element={<Credentials data={data} />} />
              <Route path="/cohorts"     element={<Cohorts data={data} />} />
              <Route path="*"            element={<Roster data={data} />} />
            </Routes>
          )}
        </div>
      </main>
    </div>
  )
}

/**
 * "We could not ask" must never look like "there is nothing to show" on a
 * screen an outside agency reports from.
 */
function ReadNotices({ errors }) {
  const failed = Object.entries(errors).filter(([, v]) => v)
  if (failed.length === 0) return null
  return (
    <div style={s.notice} role="status">
      Some panels could not be loaded and may be incomplete:{' '}
      {failed.map(([k]) => k).join(', ')}. Reload the page; if it persists, contact
      your program contact at Certified Training Standards.
    </div>
  )
}

function EmptyScope() {
  return (
    <div style={s.empty}>
      <div style={s.emptyTitle}>No cohorts assigned yet</div>
      <div style={s.emptyBody}>
        Your organisation does not currently have access to any cohort. Certified
        Training Standards grants that access — contact your program contact there if
        you were expecting to see participants here.
      </div>
    </div>
  )
}

// ── Roster ─────────────────────────────────────────────────────

function Roster({ data }) {
  const { roster, progress, credentials } = data

  const liveCredByParticipant = useMemo(() => {
    const m = new Map()
    for (const c of credentials) {
      if (c.status !== 'ACTIVE') continue
      if (!m.has(c.participant_id)) m.set(c.participant_id, c)
    }
    return m
  }, [credentials])

  if (roster.length === 0) {
    return (
      <div style={s.empty}>
        <div style={s.emptyTitle}>No participants yet</div>
        <div style={s.emptyBody}>Nobody has enrolled in your cohorts so far.</div>
      </div>
    )
  }

  return (
    <>
      <SummaryRow items={[
        { label: 'Participants', value: new Set(roster.map(r => r.participant_id)).size },
        { label: 'Cohorts',      value: new Set(roster.map(r => r.cohort_id)).size },
        { label: 'Credentials issued', value: liveCredByParticipant.size },
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
              const p    = progress.byParticipant.get(r.participant_id)
              const live = liveCredByParticipant.get(r.participant_id)
              return (
                <tr key={`${r.participant_id}-${r.cohort_id}`} style={s.tr}>
                  <Td>
                    <strong>{r.full_name}</strong>
                    <div style={s.sub}>{r.participant_status}</div>
                  </Td>
                  <Td>{r.cohort_name}</Td>
                  <Td>
                    {r.enrollment_status ?? '—'}
                    <div style={s.sub}>{fmtDate(r.enrolled_at)}</div>
                  </Td>
                  <Td><ProgressBar done={p?.completed ?? 0} total={progress.total} /></Td>
                  <Td>
                    {live
                      ? <span style={{ ...s.pill, background: '#E1F5EE', color: '#0F6E56' }}>{live.credential_name}</span>
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
  const { empowercare } = data

  if (empowercare.length === 0) {
    return (
      <div style={s.empty}>
        <div style={s.emptyTitle}>No EmpowerCare records</div>
        <div style={s.emptyBody}>
          Nobody in your cohorts is enrolled in EmpowerCare, or no sessions have been
          recorded yet.
        </div>
      </div>
    )
  }

  const totalDays  = empowercare.reduce((n, r) => n + (r.days_attended ?? 0), 0)
  const totalHours = empowercare.reduce((n, r) => n + Number(r.contact_hours ?? 0), 0)

  return (
    <>
      <SummaryRow items={[
        { label: 'Enrolled',        value: empowercare.length },
        { label: 'Days attended',   value: totalDays },
        { label: 'Contact hours',   value: totalHours.toFixed(1) },
      ]} />

      <div style={s.panel}>
        <table style={s.table}>
          <thead>
            <tr>
              <Th>Participant</Th><Th>Days attended</Th><Th>Contact hours</Th>
              <Th>First session</Th><Th>Last session</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {empowercare.map(r => {
              // Unmapped values render verbatim. Inferring a nicer label is
              // how a coarse status turns back into a gate result.
              const label = COMPLETION_LABEL[r.completion_status]
              return (
                <tr key={`${r.participant_id}-${r.cohort_id}`} style={s.tr}>
                  <Td><strong>{r.full_name}</strong></Td>
                  <Td style={s.mono}>{r.days_attended ?? 0}</Td>
                  <Td style={s.mono}>{Number(r.contact_hours ?? 0).toFixed(1)}</Td>
                  <Td>{fmtDate(r.first_attendance)}</Td>
                  <Td>{fmtDate(r.last_attendance)}</Td>
                  <Td>
                    <span style={{ ...s.pill, background: label?.bg ?? '#F1EFE8', color: label?.color ?? '#5F5E5A' }}>
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

      <div style={s.foot}>
        Days attended and contact hours are the staff-attested attendance record kept
        by Certified Training Standards. Status is reported as in progress, completed
        or exited; no other detail about a participant&rsquo;s progress through the
        program is shared with partner organisations.
      </div>
    </>
  )
}

// ── Credentials ────────────────────────────────────────────────

function Credentials({ data }) {
  const { credentials, roster } = data

  const nameFor = useMemo(() => {
    const m = new Map()
    for (const r of roster) m.set(r.participant_id, r.full_name)
    return m
  }, [roster])

  if (credentials.length === 0) {
    return (
      <div style={s.empty}>
        <div style={s.emptyTitle}>No credentials issued yet</div>
        <div style={s.emptyBody}>Credentials appear here once Certified Training Standards issues them.</div>
      </div>
    )
  }

  return (
    <div style={s.panel}>
      <table style={s.table}>
        <thead>
          <tr><Th>Participant</Th><Th>Credential</Th><Th>Code</Th><Th>Issued</Th><Th>Expires</Th><Th>Status</Th></tr>
        </thead>
        <tbody>
          {credentials.map(c => (
            <tr key={c.id} style={s.tr}>
              {/* Name from the roster, never from edu_credentials.holder_name:
                  one sanctioned source for a participant's name. */}
              <Td><strong>{nameFor.get(c.participant_id) ?? '—'}</strong></Td>
              <Td>{c.credential_name}</Td>
              <Td style={s.mono}>{c.credential_code}</Td>
              <Td>{fmtDate(c.issued_at)}</Td>
              <Td>{fmtDate(c.expires_at)}</Td>
              <Td>
                <span style={{ ...s.pill, background: c.status === 'ACTIVE' ? '#E1F5EE' : '#F1EFE8', color: c.status === 'ACTIVE' ? '#0F6E56' : '#5F5E5A' }}>
                  {c.status}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Cohorts ────────────────────────────────────────────────────

function Cohorts({ data }) {
  const { cohorts, roster } = data
  const countFor = useMemo(() => {
    const m = new Map()
    for (const r of roster) m.set(r.cohort_id, (m.get(r.cohort_id) ?? 0) + 1)
    return m
  }, [roster])

  return (
    <>
      <div style={s.panel}>
        <table style={s.table}>
          <thead><tr><Th>Cohort</Th><Th>Participants you can see</Th></tr></thead>
          <tbody>
            {cohorts.map(c => (
              <tr key={c.id} style={s.tr}>
                <Td><strong>{c.name}</strong></Td>
                <Td style={s.mono}>{countFor.get(c.id) ?? 0}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={s.foot}>
        This list is the cohorts your organisation currently has access to. Access is
        granted and withdrawn by Certified Training Standards and takes effect
        immediately.
      </div>
    </>
  )
}

// ── Small pieces ───────────────────────────────────────────────

function SummaryRow({ items }) {
  return (
    <div style={s.summary}>
      {items.map(i => (
        <div key={i.label} style={s.stat}>
          <div style={s.statLabel}>{i.label}</div>
          <div style={s.statValue}>{i.value}</div>
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

function Th({ children }) { return <th style={s.th}>{children}</th> }
function Td({ children, style }) { return <td style={{ ...s.td, ...style }}>{children}</td> }

const s = {
  wrap:       { display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif" },
  fullMsg:    { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0D1B2A', color: '#5DCAA5', fontFamily: "'DM Mono', monospace", fontSize: '14px', padding: '24px', textAlign: 'center' },
  side:       { width: '224px', minWidth: '224px', background: '#0D1B2A', display: 'flex', flexDirection: 'column' },
  brand:      { padding: '20px 18px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  brandM:     { fontFamily: "'DM Mono', monospace", fontSize: '22px', fontWeight: 500, color: '#fff', letterSpacing: '-0.5px' },
  brandAccent:{ color: '#5DCAA5' },
  brandSub:   { fontSize: '10px', color: 'rgba(255,255,255,0.60)', letterSpacing: '0.07em', marginTop: '2px', textTransform: 'uppercase' },
  vendorCard: { padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  vendorName: { fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.88)' },
  vendorKind: { fontSize: '10px', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', marginTop: '2px' },
  nav:        { padding: '12px 10px', flex: 1 },
  navItem:    { display: 'block', padding: '9px 10px', borderRadius: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.55)', marginBottom: '1px' },
  navActive:  { background: 'rgba(33,118,174,0.25)', color: '#fff', fontWeight: 500 },
  readOnly:   { padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '10px', color: 'rgba(255,255,255,0.55)', lineHeight: '1.6' },
  main:       { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F7F9FC' },
  top:        { background: '#fff', borderBottom: '1px solid #CBD8E6', padding: '0 24px', height: '54px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  topTitle:   { fontSize: '15px', fontWeight: 500, color: '#0D1B2A' },
  topRight:   { display: 'flex', alignItems: 'center', gap: '12px' },
  topUser:    { fontSize: '12px', color: '#5D768A' },
  signOut:    { background: 'none', border: '1px solid #CBD8E6', borderRadius: '6px', color: '#4A6080', fontSize: '11px', cursor: 'pointer', padding: '5px 10px', fontFamily: "'DM Sans', sans-serif" },
  body:       { flex: 1, overflowY: 'auto', padding: '22px' },
  notice:     { background: '#FAEEDA', color: '#854F0B', borderRadius: '10px', padding: '11px 14px', fontSize: '12px', lineHeight: '1.6', marginBottom: '14px' },
  summary:    { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '12px', marginBottom: '16px' },
  stat:       { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '12px', padding: '14px 16px' },
  statLabel:  { fontSize: '11px', color: '#5D768A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' },
  statValue:  { fontSize: '26px', fontWeight: 300, color: '#0D1B2A', fontFamily: "'DM Mono', monospace", lineHeight: 1 },
  panel:      { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '16px', overflow: 'hidden' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:         { padding: '9px 14px', textAlign: 'left', fontWeight: 500, fontSize: '11px', color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #CBD8E6', background: '#F7F9FC' },
  td:         { padding: '10px 14px', color: '#0D1B2A', verticalAlign: 'top' },
  tr:         { borderBottom: '1px solid #F0F4F8' },
  sub:        { fontSize: '11px', color: '#5D768A', marginTop: '2px' },
  mono:       { fontFamily: "'DM Mono', monospace" },
  pill:       { fontSize: '10px', fontWeight: 600, padding: '2px 9px', borderRadius: '20px', display: 'inline-block' },
  dash:       { color: '#8BA0B8' },
  barTrack:   { height: '6px', width: '120px', background: '#F0F4F8', borderRadius: '3px', overflow: 'hidden' },
  barFill:    { height: '100%', background: '#2176AE', borderRadius: '3px' },
  empty:      { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '16px', padding: '30px 26px', maxWidth: '560px' },
  emptyTitle: { fontSize: '15px', fontWeight: 500, color: '#0D1B2A', marginBottom: '8px' },
  emptyBody:  { fontSize: '13px', color: '#4A6080', lineHeight: '1.7' },
  foot:       { marginTop: '14px', fontSize: '11px', color: '#5D768A', lineHeight: '1.7', maxWidth: '680px' },
}
