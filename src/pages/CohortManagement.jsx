// src/pages/CohortManagement.jsx
// ── Morpheus CRM — Cohort Management ───────────────────────────

import { useState, useEffect } from 'react'
import { getCohortOverview, createCohort, enrollParticipant, getParticipantPerformance } from '../lib/db.js'
import { useAuth } from '../hooks/useAuth.jsx'

const STATUS_COLORS = {
  Active:     { bg: '#E1F5EE', color: '#0F6E56' },
  Scheduled:  { bg: '#E6F1FB', color: '#0C447C' },
  Completed:  { bg: '#F1EFE8', color: '#5F5E5A' },
  Archived:   { bg: '#F1EFE8', color: '#8BA0B8' },
}

const PROGRAM_SOURCES = ['LDSS Albany','LDSS Schenectady','Reentry / Incarcerated','Direct Enrollment']

export default function CohortManagement({ staffProfiles = [] }) {
  const { user } = useAuth()
  const [cohorts, setCohorts]           = useState([])
  const [participants, setParticipants] = useState([])
  const [loading, setLoading]           = useState(true)
  const [showCreate, setShowCreate]     = useState(false)
  const [showEnroll, setShowEnroll]     = useState(null)  // cohort id
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState(null)

  const [newCohort, setNewCohort] = useState({
    name: '', program_source: '', start_date: '', end_date: '', trainer_id: '',
  })

  useEffect(() => {
    async function load() {
      const [c, p] = await Promise.all([
        getCohortOverview(),
        getParticipantPerformance(),
      ])
      setCohorts(c ?? [])
      setParticipants(p ?? [])
      setLoading(false)
    }
    load()
  }, [])

  async function handleCreateCohort() {
    setSaving(true); setError(null)
    try {
      const c = await createCohort({
        name:           newCohort.name,
        program_source: newCohort.program_source,
        start_date:     newCohort.start_date,
        end_date:       newCohort.end_date || null,
        trainer_id:     newCohort.trainer_id || null,
        status:         'Scheduled',
      })
      setCohorts(prev => [{ ...c, participant_count: 0, total_calls: 0, cohort_avg_score: null, trainer_name: staffProfiles.find(s => s.id === c.trainer_id)?.full_name ?? null }, ...prev])
      setShowCreate(false)
      setNewCohort({ name:'', program_source:'', start_date:'', end_date:'', trainer_id:'' })
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleEnroll(cohortId, participantId) {
    try {
      await enrollParticipant(cohortId, participantId)
      setCohorts(prev => prev.map(c =>
        c.id === cohortId ? { ...c, participant_count: (c.participant_count ?? 0) + 1 } : c
      ))
    } catch (e) { setError(e.message) }
  }

  if (loading) return <div style={s.loading}>Loading cohorts…</div>

  return (
    <div style={s.page}>
      <div style={s.topRow}>
        <div>
          <h1 style={s.title}>Cohorts</h1>
          <p style={s.sub}>{cohorts.length} cohort{cohorts.length !== 1 ? 's' : ''} · {cohorts.reduce((n, c) => n + (c.participant_count ?? 0), 0)} total participants enrolled</p>
        </div>
        <button style={s.btnPrimary} onClick={() => setShowCreate(true)}>+ New cohort</button>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {/* ── Create cohort modal ── */}
      {showCreate && (
        <div style={s.modal}>
          <div style={s.modalCard}>
            <div style={s.modalTitle}>Create new cohort</div>
            <div style={s.formGrid}>
              <div style={{ ...s.fg, gridColumn: '1/-1' }}>
                <label style={s.label}>Cohort name <span style={s.req}>*</span></label>
                <input style={s.input} placeholder="e.g. Spring 2025 – Cohort A"
                  value={newCohort.name} onChange={e => setNewCohort(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div style={s.fg}>
                <label style={s.label}>Program source <span style={s.req}>*</span></label>
                <select style={s.input} value={newCohort.program_source}
                  onChange={e => setNewCohort(p => ({ ...p, program_source: e.target.value }))}>
                  <option value="">Select…</option>
                  {PROGRAM_SOURCES.map(ps => <option key={ps}>{ps}</option>)}
                </select>
              </div>
              <div style={s.fg}>
                <label style={s.label}>Lead trainer</label>
                <select style={s.input} value={newCohort.trainer_id}
                  onChange={e => setNewCohort(p => ({ ...p, trainer_id: e.target.value }))}>
                  <option value="">Select…</option>
                  {staffProfiles.map(sp => <option key={sp.id} value={sp.id}>{sp.full_name}</option>)}
                </select>
              </div>
              <div style={s.fg}>
                <label style={s.label}>Start date <span style={s.req}>*</span></label>
                <input style={s.input} type="date" value={newCohort.start_date}
                  onChange={e => setNewCohort(p => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div style={s.fg}>
                <label style={s.label}>End date</label>
                <input style={s.input} type="date" value={newCohort.end_date}
                  onChange={e => setNewCohort(p => ({ ...p, end_date: e.target.value }))} />
              </div>
            </div>
            {error && <div style={s.errorBox}>{error}</div>}
            <div style={s.modalActions}>
              <button style={s.btn} onClick={() => { setShowCreate(false); setError(null) }}>Cancel</button>
              <button style={s.btnPrimary} disabled={!newCohort.name || !newCohort.program_source || !newCohort.start_date || saving}
                onClick={handleCreateCohort}>
                {saving ? 'Creating…' : 'Create cohort'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cohort cards ── */}
      <div style={s.cohortGrid}>
        {cohorts.map(c => {
          const sc = STATUS_COLORS[c.status] ?? STATUS_COLORS.Active
          const pct = c.participant_count > 0 && c.cohort_avg_score
            ? Math.min(100, Math.round((c.cohort_avg_score / 100) * 100))
            : 0
          return (
            <div key={c.id} style={s.cohortCard}>
              <div style={s.cohortTop}>
                <div>
                  <div style={s.cohortName}>{c.name}</div>
                  <div style={s.cohortSource}>{c.program_source}</div>
                </div>
                <span style={{ ...s.badge, background: sc.bg, color: sc.color }}>{c.status}</span>
              </div>
              <div style={s.cohortStats}>
                <div style={s.cstat}>
                  <div style={s.cstatVal}>{c.participant_count ?? 0}</div>
                  <div style={s.cstatLabel}>Participants</div>
                </div>
                <div style={s.cstat}>
                  <div style={s.cstatVal}>{c.total_calls ?? 0}</div>
                  <div style={s.cstatLabel}>Calls logged</div>
                </div>
                <div style={s.cstat}>
                  <div style={{ ...s.cstatVal, color: c.cohort_avg_score ? (c.cohort_avg_score >= 80 ? '#0F6E56' : c.cohort_avg_score >= 60 ? '#BA7517' : '#993C1D') : '#CBD8E6' }}>
                    {c.cohort_avg_score ?? '—'}
                  </div>
                  <div style={s.cstatLabel}>Avg score</div>
                </div>
              </div>
              {c.trainer_name && (
                <div style={s.cohortTrainer}>Trainer: {c.trainer_name}</div>
              )}
              {c.start_date && (
                <div style={s.cohortDates}>
                  {new Date(c.start_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                  {c.end_date && ` → ${new Date(c.end_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`}
                </div>
              )}
              <div style={s.cohortActions}>
                <button style={s.btn}
                  onClick={() => setShowEnroll(showEnroll === c.id ? null : c.id)}>
                  {showEnroll === c.id ? 'Close' : '+ Enroll participant'}
                </button>
                <button style={s.btnOutline}>Export PDF</button>
              </div>

              {/* Enrollment sub-panel */}
              {showEnroll === c.id && (
                <div style={s.enrollPanel}>
                  <div style={s.enrollTitle}>Enroll a participant</div>
                  <div style={s.enrollList}>
                    {participants
                      .filter(p => p.status === 'Active')
                      .map(p => (
                        <div key={p.participant_id} style={s.enrollRow}>
                          <div style={s.enrollName}>{p.full_name}</div>
                          <div style={s.enrollSource}>{p.program_source}</div>
                          <button style={s.enrollBtn}
                            onClick={() => handleEnroll(c.id, p.participant_id)}>
                            Enroll
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const s = {
  page: { fontFamily: "'DM Sans', sans-serif" },
  loading: { padding: '40px', color: '#4A6080', fontSize: '14px' },
  topRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  title: { fontSize: '20px', fontWeight: 500, color: '#0D1B2A', marginBottom: '3px' },
  sub: { fontSize: '13px', color: '#4A6080' },
  btn: { padding: '7px 14px', border: '1px solid #CBD8E6', borderRadius: '8px', background: '#fff', color: '#0D1B2A', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  btnPrimary: { padding: '8px 16px', border: 'none', borderRadius: '8px', background: '#0D1B2A', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  btnOutline: { padding: '7px 14px', border: '1px solid #CBD8E6', borderRadius: '8px', background: 'transparent', color: '#4A6080', fontSize: '12px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  errorBox: { background: '#FAECE7', color: '#993C1D', borderRadius: '8px', padding: '11px 14px', fontSize: '13px', marginBottom: '16px' },
  cohortGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '14px' },
  cohortCard: { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '16px', padding: '18px' },
  cohortTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' },
  cohortName: { fontSize: '14px', fontWeight: 600, color: '#0D1B2A', marginBottom: '3px' },
  cohortSource: { fontSize: '12px', color: '#4A6080' },
  badge: { fontSize: '10px', fontWeight: 600, padding: '3px 9px', borderRadius: '20px', flexShrink: 0 },
  cohortStats: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '12px' },
  cstat: { textAlign: 'center', background: '#F7F9FC', borderRadius: '8px', padding: '8px 4px' },
  cstatVal: { fontSize: '20px', fontWeight: 300, color: '#0D1B2A', fontFamily: "'DM Mono', monospace" },
  cstatLabel: { fontSize: '10px', color: '#8BA0B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' },
  cohortTrainer: { fontSize: '12px', color: '#4A6080', marginBottom: '3px' },
  cohortDates: { fontSize: '11px', color: '#8BA0B8', fontFamily: "'DM Mono', monospace", marginBottom: '12px' },
  cohortActions: { display: 'flex', gap: '7px' },
  enrollPanel: { background: '#F7F9FC', border: '1px solid #E8EFF6', borderRadius: '10px', padding: '12px', marginTop: '12px' },
  enrollTitle: { fontSize: '11px', fontWeight: 600, color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' },
  enrollList: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' },
  enrollRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: '#fff', borderRadius: '6px', border: '1px solid #E8EFF6' },
  enrollName: { flex: 1, fontSize: '12px', fontWeight: 500, color: '#0D1B2A' },
  enrollSource: { fontSize: '11px', color: '#8BA0B8' },
  enrollBtn: { padding: '3px 10px', border: 'none', borderRadius: '5px', background: '#0D1B2A', color: '#fff', fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  modal: { position: 'fixed', inset: 0, background: 'rgba(13,27,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { background: '#fff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  modalTitle: { fontSize: '16px', fontWeight: 500, color: '#0D1B2A', marginBottom: '20px' },
  modalActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #F0F4F8', marginTop: '16px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  fg: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontSize: '11px', fontWeight: 600, color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.06em' },
  req: { color: '#993C1D' },
  input: { padding: '8px 10px', border: '1px solid #CBD8E6', borderRadius: '8px', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", color: '#0D1B2A' },
}
