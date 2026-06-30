// src/pages/ParticipantProfile.jsx
// ── Morpheus CRM — Participant Profile Page ─────────────────────
// Full profile view: stats, call history, category averages,
// cert status, and trainer notes. Accessible by trainers.

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getParticipantProfile, getCallHistory, checkCertEligibility } from '../lib/db.js'
import { generateProgressReportPDF } from '../lib/report.js'

const CATS = ['Opening','Listening','Empathy','Resolution','Policy','Closing']
const SCORE_KEYS = ['score_opening','score_listening','score_empathy','score_resolution','score_policy','score_closing']

function scoreColor(s) {
  if (s >= 80) return '#0F6E56'
  if (s >= 60) return '#BA7517'
  return '#993C1D'
}
function scoreBg(s) {
  if (s >= 80) return '#E1F5EE'
  if (s >= 60) return '#FAEEDA'
  return '#FAECE7'
}
function scoreLabel(s) {
  if (s >= 80) return 'Proficient'
  if (s >= 60) return 'Developing'
  return 'Unsatisfactory'
}

export default function ParticipantProfile() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [participant, setParticipant] = useState(null)
  const [calls, setCalls]             = useState([])
  const [eligibility, setEligibility] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [exporting, setExporting]     = useState(false)
  const [activeCall, setActiveCall]   = useState(null)  // expanded call detail

  useEffect(() => {
    async function load() {
      try {
        const [p, h, e] = await Promise.all([
          getParticipantProfile(id),
          getCallHistory(id, 50),
          checkCertEligibility(id),
        ])
        setParticipant(p)
        setCalls(h)
        setEligibility(e)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  // Category averages across all scored calls
  const completedCalls = calls.filter(c => c.call_scores?.length > 0)
  const catAvgs = SCORE_KEYS.map((key, i) => {
    if (!completedCalls.length) return null
    const avg = completedCalls.reduce((sum, c) => sum + (c.call_scores[0]?.[key] ?? 0), 0) / completedCalls.length
    return Math.round(avg)
  })
  const overallAvg = completedCalls.length
    ? Math.round(completedCalls.reduce((s, c) => s + (c.call_scores[0]?.total_score ?? 0), 0) / completedCalls.length)
    : null

  async function handleExport() {
    setExporting(true)
    try {
      await generateProgressReportPDF({ participant, calls: completedCalls, eligibility })
    } catch (e) {
      console.error('PDF export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div style={s.loading}>Loading profile…</div>
  if (!participant) return <div style={s.loading}>Participant not found.</div>

  const cert = eligibility?.already_certified
  const eligible = eligibility?.is_eligible && !cert

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <div style={s.headerRow}>
        <button style={s.backBtn} onClick={() => navigate(-1)}>← Participants</button>
        <div style={s.headerActions}>
          <button style={s.btn}
            onClick={() => navigate(`/simulator?participant=${id}`)}>
            Start mock call
          </button>
          <button style={{ ...s.btn, ...s.btnPrimary }}
            disabled={exporting} onClick={handleExport}>
            {exporting ? 'Generating…' : 'Export LDSS report'}
          </button>
        </div>
      </div>

      {/* ── Identity card ── */}
      <div style={s.identCard}>
        <div style={s.avatar}>
          {participant.full_name.split(' ').map(n => n[0]).join('').slice(0,2)}
        </div>
        <div style={s.identInfo}>
          <div style={s.identName}>{participant.full_name}</div>
          <div style={s.identMeta}>
            <span style={s.ctsId}>{participant.cts_id}</span>
            <span style={s.dot}>·</span>
            <span>{participant.program_source}</span>
            {participant.ldss_office && <><span style={s.dot}>·</span><span>{participant.ldss_office}</span></>}
          </div>
          <div style={s.identMeta}>
            {participant.ldss_case_number && <span>Case: <strong>{participant.ldss_case_number}</strong></span>}
            {participant.ldss_caseworker && <><span style={s.dot}>·</span><span>Caseworker: <strong>{participant.ldss_caseworker}</strong></span></>}
            {participant.staff_profiles?.full_name && <><span style={s.dot}>·</span><span>Trainer: <strong>{participant.staff_profiles.full_name}</strong></span></>}
          </div>
        </div>
        <div style={s.identRight}>
          <StatusBadge status={participant.status} cert={cert} eligible={eligible} />
          {cert && <div style={s.certNum}>Certified ✓</div>}
          {eligible && <div style={s.certPending}>Eligible for certification</div>}
        </div>
      </div>

      {/* ── Stats row ── */}
      <div style={s.statsRow}>
        <StatCard label="Calls completed" value={completedCalls.length} />
        <StatCard label="Avg score" value={overallAvg ?? '—'} color={overallAvg ? scoreColor(overallAvg) : undefined} />
        <StatCard label="Best score" value={completedCalls.length ? Math.max(...completedCalls.map(c => c.call_scores[0]?.total_score ?? 0)) : '—'} />
        <StatCard label="Cert threshold" value="80" sub="score required" />
      </div>

      <div style={s.twoCol}>
        {/* ── Category averages ── */}
        <div style={s.card}>
          <div style={s.cardTitle}>Performance by category</div>
          {CATS.map((cat, i) => {
            const avg = catAvgs[i]
            return (
              <div key={cat} style={s.catRow}>
                <div style={s.catLabel}>{cat}</div>
                <div style={s.barTrack}>
                  <div style={{ ...s.barFill, width: `${avg ?? 0}%`, background: avg ? scoreColor(avg) : '#CBD8E6' }} />
                </div>
                <div style={{ ...s.catVal, color: avg ? scoreColor(avg) : '#CBD8E6' }}>
                  {avg ?? '—'}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Participant details ── */}
        <div style={s.card}>
          <div style={s.cardTitle}>Record details</div>
          <DetailRow label="CTS ID"           value={participant.cts_id} mono />
          <DetailRow label="DOB"              value={participant.dob ?? '—'} />
          <DetailRow label="Enrollment date"  value={participant.enrollment_date} />
          <DetailRow label="Status"           value={participant.status} />
          {participant.notes && (
            <>
              <div style={{ ...s.cardTitle, marginTop: '16px' }}>Notes</div>
              <p style={{ fontSize: '13px', color: '#4A6080', lineHeight: '1.6' }}>{participant.notes}</p>
            </>
          )}
        </div>
      </div>

      {/* ── Call history ── */}
      <div style={s.card}>
        <div style={s.cardTitle}>Call history ({completedCalls.length} sessions)</div>
        {completedCalls.length === 0 && (
          <div style={s.empty}>No completed call sessions yet.</div>
        )}
        {completedCalls.map(call => {
          const sc = call.call_scores[0]
          const total = sc?.total_score ?? 0
          const isOpen = activeCall === call.id
          return (
            <div key={call.id} style={s.callRow} onClick={() => setActiveCall(isOpen ? null : call.id)}>
              <div style={s.callRowMain}>
                <span style={s.callDate}>{new Date(call.started_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
                <span style={s.callScenario}>{call.scenario_type}</span>
                <span style={{ ...s.diffTag, background: call.difficulty === 'Advanced' ? '#FAEEDA' : call.difficulty === 'Intermediate' ? '#E6F1FB' : '#EAF3DE', color: call.difficulty === 'Advanced' ? '#854F0B' : call.difficulty === 'Intermediate' ? '#0C447C' : '#27500A' }}>
                  {call.difficulty}
                </span>
                <span style={{ ...s.totalScore, color: scoreColor(total), background: scoreBg(total) }}>
                  {total}
                </span>
                <span style={s.expandIcon}>{isOpen ? '▲' : '▼'}</span>
              </div>
              {isOpen && sc && (
                <div style={s.callDetail}>
                  <div style={s.callCats}>
                    {CATS.map((cat, i) => (
                      <div key={cat} style={s.miniCat}>
                        <div style={s.miniCatLabel}>{cat}</div>
                        <div style={{ ...s.miniCatVal, color: scoreColor(sc[SCORE_KEYS[i]]) }}>
                          {sc[SCORE_KEYS[i]]}
                        </div>
                      </div>
                    ))}
                  </div>
                  {sc.ai_feedback && (
                    <div style={s.feedbackBox}>
                      <strong>AI feedback:</strong> {sc.ai_feedback}
                    </div>
                  )}
                  {sc.trainer_notes && (
                    <div style={{ ...s.feedbackBox, background: '#E6F1FB', borderColor: '#B5D4F4' }}>
                      <strong>Trainer notes:</strong> {sc.trainer_notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({ label, value, color, sub }) {
  return (
    <div style={s.statCard}>
      <div style={{ ...s.statVal, ...(color ? { color } : {}) }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
      {sub && <div style={s.statSub}>{sub}</div>}
    </div>
  )
}

function DetailRow({ label, value, mono }) {
  return (
    <div style={s.detailRow}>
      <span style={s.detailLabel}>{label}</span>
      <span style={{ ...s.detailVal, ...(mono ? { fontFamily: "'DM Mono', monospace", fontSize: '12px' } : {}) }}>{value}</span>
    </div>
  )
}

function StatusBadge({ status, cert, eligible }) {
  if (cert)     return <span style={{ ...s.badge, background: '#E1F5EE', color: '#0F6E56' }}>Certified</span>
  if (eligible) return <span style={{ ...s.badge, background: '#FAEEDA', color: '#BA7517' }}>Cert eligible</span>
  return <span style={{ ...s.badge, background: '#E6F1FB', color: '#0C447C' }}>{status}</span>
}

const s = {
  page: { maxWidth: '900px', fontFamily: "'DM Sans', sans-serif" },
  loading: { padding: '40px', color: '#4A6080', fontSize: '14px' },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' },
  backBtn: { background: 'none', border: 'none', color: '#2176AE', fontSize: '13px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", padding: 0 },
  headerActions: { display: 'flex', gap: '8px' },
  btn: { padding: '8px 16px', border: '1px solid #CBD8E6', borderRadius: '8px', background: '#fff', color: '#0D1B2A', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  btnPrimary: { background: '#0D1B2A', color: '#fff', border: 'none' },
  identCard: { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '16px', padding: '22px 24px', display: 'flex', alignItems: 'flex-start', gap: '18px', marginBottom: '16px' },
  avatar: { width: '52px', height: '52px', borderRadius: '50%', background: '#0D1B2A', color: '#5DCAA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 600, flexShrink: 0, fontFamily: "'DM Mono', monospace" },
  identInfo: { flex: 1 },
  identName: { fontSize: '18px', fontWeight: 500, color: '#0D1B2A', marginBottom: '5px' },
  identMeta: { fontSize: '12px', color: '#4A6080', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' },
  ctsId: { fontFamily: "'DM Mono', monospace", fontSize: '11px', background: '#E6F1FB', color: '#0C447C', borderRadius: '4px', padding: '2px 7px' },
  dot: { color: '#CBD8E6' },
  identRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' },
  badge: { fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', letterSpacing: '0.04em' },
  certNum: { fontFamily: "'DM Mono', monospace", fontSize: '11px', color: '#0F6E56' },
  certPending: { fontSize: '11px', color: '#BA7517' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' },
  statCard: { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '12px', padding: '16px' },
  statVal: { fontSize: '28px', fontWeight: 300, color: '#0D1B2A', fontFamily: "'DM Mono', monospace", lineHeight: 1 },
  statLabel: { fontSize: '11px', color: '#8BA0B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '5px' },
  statSub: { fontSize: '11px', color: '#CBD8E6', marginTop: '2px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' },
  card: { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '16px', padding: '20px', marginBottom: '12px' },
  cardTitle: { fontSize: '11px', fontWeight: 600, color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' },
  catRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' },
  catLabel: { fontSize: '12px', color: '#4A6080', width: '80px', flexShrink: 0 },
  barTrack: { flex: 1, height: '6px', background: '#F0F4F8', borderRadius: '3px', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '3px', transition: 'width 0.6s ease' },
  catVal: { fontSize: '12px', fontWeight: 600, width: '28px', textAlign: 'right', fontFamily: "'DM Mono', monospace" },
  detailRow: { display: 'flex', gap: '10px', padding: '7px 0', borderBottom: '1px solid #F0F4F8', fontSize: '13px' },
  detailLabel: { width: '120px', color: '#4A6080', flexShrink: 0 },
  detailVal: { color: '#0D1B2A', fontWeight: 500 },
  callRow: { borderBottom: '1px solid #F0F4F8', cursor: 'pointer' },
  callRowMain: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0' },
  callDate: { fontFamily: "'DM Mono', monospace", fontSize: '11px', color: '#8BA0B8', width: '50px', flexShrink: 0 },
  callScenario: { flex: 1, fontSize: '13px', color: '#0D1B2A' },
  diffTag: { fontSize: '10px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, flexShrink: 0 },
  totalScore: { fontSize: '13px', fontWeight: 700, padding: '2px 9px', borderRadius: '8px', fontFamily: "'DM Mono', monospace", flexShrink: 0 },
  expandIcon: { fontSize: '9px', color: '#CBD8E6', flexShrink: 0 },
  callDetail: { padding: '12px 0 14px', borderTop: '1px solid #F7F9FC' },
  callCats: { display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '8px', marginBottom: '12px' },
  miniCat: { textAlign: 'center' },
  miniCatLabel: { fontSize: '10px', color: '#8BA0B8', marginBottom: '3px' },
  miniCatVal: { fontSize: '14px', fontWeight: 600, fontFamily: "'DM Mono', monospace" },
  feedbackBox: { background: '#F7F9FC', border: '1px solid #E8EFF6', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#4A6080', lineHeight: '1.6', marginTop: '8px' },
  empty: { color: '#8BA0B8', fontSize: '13px', fontStyle: 'italic', padding: '12px 0' },
}
