// src/pages/ScoreMatrix.jsx
// ── Morpheus CRM — Score Matrix Weight Editor (Sprint 3) ────────
// Trainers and admins can adjust the six rubric category weights.
// Supports global defaults and per-cohort overrides.
// Weights must sum to 100 before saving.

import { useState, useEffect } from 'react'
import { getScoreWeights, updateScoreWeights, getCohortOverview } from '../lib/db.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { Tabs } from '../components/a11y.jsx'

const CATS = [
  {
    key: 'opening',
    label: 'Opening / Greeting',
    description: 'Professional self-identification, warm welcome, inviting tone',
    defaultWeight: 15,
  },
  {
    key: 'listening',
    label: 'Active Listening',
    description: 'No interruptions, clarifying questions, confirms understanding',
    defaultWeight: 20,
  },
  {
    key: 'empathy',
    label: 'Empathy & Tone',
    description: 'Acknowledges feelings, calm and genuine throughout',
    defaultWeight: 20,
  },
  {
    key: 'resolution',
    label: 'Problem Resolution',
    description: 'Identifies root issue, complete solution, confirmed with caller',
    defaultWeight: 25,
  },
  {
    key: 'policy',
    label: 'Policy Adherence',
    description: 'Follows procedures, no unauthorized promises',
    defaultWeight: 10,
  },
  {
    key: 'closing',
    label: 'Closing',
    description: 'Summarizes resolution, confirms satisfaction, professional sign-off',
    defaultWeight: 10,
  },
]

const RUBRIC_LEVELS = [
  { range: '0–59', label: 'Unsatisfactory', color: '#993C1D', bg: '#FAECE7' },
  { range: '60–79', label: 'Developing',    color: '#854F0B', bg: '#FAEEDA' },
  { range: '80–100', label: 'Proficient',   color: '#0F6E56', bg: '#E1F5EE' },
]

const RUBRIC_DETAIL = {
  opening: [
    'Fails to identify self or company; no warm welcome',
    'Introduces self but misses company name or sounds robotic',
    'Warm, professional greeting with full identification and inviting tone',
  ],
  listening: [
    'Interrupts caller; misses key details; asks repetitive questions',
    'Listens adequately but misses nuance; needs prompting to clarify',
    'Reflects concerns back; clarifying questions; confirms understanding',
  ],
  empathy: [
    'Dismissive, cold, or defensive; does not acknowledge feelings',
    'Acknowledges issue but tone is flat or scripted',
    'Genuine empathy; validates emotions; maintains calm professional tone',
  ],
  resolution: [
    'Cannot resolve or offer alternatives; escalates without attempt',
    'Resolves partially; solution incomplete or not confirmed',
    'Identifies root issue; offers clear solution; confirms resolution',
  ],
  policy: [
    'Contradicts policy; makes promises not permitted',
    'Generally follows policy with minor errors',
    'Fully compliant; explains policy clearly when relevant',
  ],
  closing: [
    'Abrupt end; does not confirm satisfaction or next steps',
    'Closes but omits satisfaction check or summary',
    'Summarizes resolution; confirms satisfaction; professional sign-off',
  ],
}

export default function ScoreMatrix() {
  const { user } = useAuth()
  const [cohorts, setCohorts]       = useState([])
  const [selectedCohort, setSelectedCohort] = useState(null)  // null = global
  const [weights, setWeights]       = useState(
    Object.fromEntries(CATS.map(c => [c.key, c.defaultWeight]))
  )
  const [savedWeights, setSavedWeights] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState(null)
  const [activeTab, setActiveTab]   = useState('weights')  // 'weights' | 'rubric'

  // Load cohorts + global weights on mount
  useEffect(() => {
    async function load() {
      const [c, w] = await Promise.all([
        getCohortOverview(),
        getScoreWeights(null),
      ])
      setCohorts(c ?? [])
      const parsed = parseWeights(w)
      setWeights(parsed)
      setSavedWeights(parsed)
      setLoading(false)
    }
    load()
  }, [])

  // Reload weights when cohort selection changes
  useEffect(() => {
    async function reload() {
      setLoading(true)
      try {
        const w = await getScoreWeights(selectedCohort)
        const parsed = parseWeights(w)
        setWeights(parsed)
        setSavedWeights(parsed)
      } catch { /* fall through */ }
      setLoading(false)
    }
    reload()
  }, [selectedCohort])

  function parseWeights(w) {
    if (!w) return Object.fromEntries(CATS.map(c => [c.key, c.defaultWeight]))
    return {
      opening:    Number(w.weight_opening)    || 15,
      listening:  Number(w.weight_listening)  || 20,
      empathy:    Number(w.weight_empathy)    || 20,
      resolution: Number(w.weight_resolution) || 25,
      policy:     Number(w.weight_policy)     || 10,
      closing:    Number(w.weight_closing)    || 10,
    }
  }

  const total = Object.values(weights).reduce((s, v) => s + Number(v), 0)
  const isValid = Math.round(total) === 100
  const isDirty = JSON.stringify(weights) !== JSON.stringify(savedWeights)

  function setWeight(key, val) {
    const n = Math.max(0, Math.min(100, Number(val) || 0))
    setWeights(prev => ({ ...prev, [key]: n }))
    setSaved(false)
  }

  async function handleSave() {
    if (!isValid) return
    setSaving(true)
    setError(null)
    try {
      await updateScoreWeights(weights, selectedCohort, null)
      setSavedWeights({ ...weights })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch(e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setWeights(Object.fromEntries(CATS.map(c => [c.key, c.defaultWeight])))
    setSaved(false)
  }

  if (loading) return <div style={s.loading}>Loading score matrix…</div>

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>Score Matrix</h1>
          <p style={s.sub}>
            Adjust rubric category weights. Changes apply to all future scored calls
            {selectedCohort ? ' for this cohort' : ' globally'}.
          </p>
        </div>
        <div style={s.cohortSelector}>
          <label style={s.label} htmlFor="scorematrix-apply-to">Apply to</label>
          <select id="scorematrix-apply-to" style={{ ...s.input, width:'220px' }}
            value={selectedCohort ?? ''}
            onChange={e => setSelectedCohort(e.target.value || null)}>
            <option value="">Global default (all cohorts)</option>
            {cohorts.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        label="Score matrix sections"
        idPrefix="matrix"
        value={activeTab}
        onChange={setActiveTab}
        style={s.tabRow}
        itemStyle={s.tab}
        activeItemStyle={s.tabActive}
        items={[
          { value: 'weights', label: 'Category weights' },
          { value: 'rubric',  label: 'Rubric descriptors' },
        ]}
      />

      {/* ── Weights tab ── */}
      {activeTab === 'weights' && (
        <div style={s.card}>
          {/* Visual weight distribution */}
          <div style={s.weightBar}>
            {CATS.map((cat, i) => {
              const w = weights[cat.key] ?? 0
              const colors = ['#2176AE','#0F6E56','#854F0B','#534AB7','#993C1D','#5F5E5A']
              return (
                <div key={cat.key} style={{
                  flex: w, background: colors[i], height:'100%',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  minWidth: w > 5 ? '28px' : '0',
                  overflow:'hidden', transition:'flex 0.3s ease',
                }}>
                  {w >= 8 && (
                    <span style={{ fontSize:'11px', fontWeight:600, color:'#fff' }}>{w}%</span>
                  )}
                </div>
              )
            })}
          </div>
          <div style={s.weightBarLegend}>
            {CATS.map((cat, i) => {
              const colors = ['#2176AE','#0F6E56','#854F0B','#534AB7','#993C1D','#5F5E5A']
              return (
                <div key={cat.key} style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                  <div style={{ width:'8px', height:'8px', borderRadius:'2px', background:colors[i], flexShrink:0 }} />
                  <span style={{ fontSize:'10px', color:'var(--color-text-tertiary)' }}>{cat.label.split(' ')[0]}</span>
                </div>
              )
            })}
          </div>

          <div style={s.divider} />

          {/* Weight sliders */}
          {CATS.map(cat => (
            <div key={cat.key} style={s.weightRow}>
              <div style={s.weightLeft}>
                {/* The visible category name is the label for both controls;
                    the description is their accessible description, so a
                    screen reader hears what the weight actually governs. */}
                <div style={s.weightLabel} id={`w-${cat.key}-label`}>{cat.label}</div>
                <div style={s.weightDesc} id={`w-${cat.key}-desc`}>{cat.description}</div>
              </div>
              <div style={s.weightControls}>
                <input type="range" min="0" max="60" step="1"
                  aria-labelledby={`w-${cat.key}-label`}
                  aria-describedby={`w-${cat.key}-desc`}
                  value={weights[cat.key] ?? 0}
                  onChange={e => setWeight(cat.key, e.target.value)}
                  style={{ width:'120px', accentColor:'#0D1B2A' }}
                />
                <div style={{ position:'relative' }}>
                  <input type="number" min="0" max="100" step="1"
                    aria-labelledby={`w-${cat.key}-label`}
                    aria-describedby={`w-${cat.key}-desc`}
                    value={weights[cat.key] ?? 0}
                    onChange={e => setWeight(cat.key, e.target.value)}
                    style={{ ...s.input, width:'64px', textAlign:'center', paddingRight:'20px' }}
                  />
                  <span style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)', fontSize:'12px', color:'var(--color-text-tertiary)', pointerEvents:'none' }}>%</span>
                </div>
              </div>
            </div>
          ))}

          {/* Total + actions */}
          <div style={s.totalRow}>
            <div style={{
              ...s.totalPill,
              background: isValid ? '#E1F5EE' : '#FAECE7',
              color:       isValid ? '#0F6E56' : '#993C1D',
            }}>
              Total: {Math.round(total)}% {isValid ? '✓' : '— must equal 100%'}
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button style={s.btn} onClick={handleReset}>Reset to defaults</button>
              <button style={{
                ...s.btnPrimary,
                opacity: (!isValid || saving || !isDirty) ? 0.45 : 1,
              }}
                disabled={!isValid || saving || !isDirty}
                onClick={handleSave}>
                {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save weights'}
              </button>
            </div>
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          <div style={s.certNote}>
            <strong>Certification threshold:</strong> a cumulative weighted average of 80 or
            above across a minimum of 5 evaluated calls. This is the standard for the
            call-scored credentials issued by Certified Training Standards, including the
            ClearCall Call Center Customer Service Certification, whose Module 4 assessment
            is scored against this matrix.
          </div>
        </div>
      )}

      {/* ── Rubric tab ── */}
      {activeTab === 'rubric' && (
        <div style={s.card}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'18px' }}>
            {RUBRIC_LEVELS.map(l => (
              <div key={l.label} style={{ background:l.bg, borderRadius:'10px', padding:'12px 14px', textAlign:'center' }}>
                <div style={{ fontSize:'11px', color:l.color, fontWeight:600, letterSpacing:'0.05em', marginBottom:'2px' }}>{l.range}</div>
                <div style={{ fontSize:'13px', fontWeight:600, color:l.color }}>{l.label}</div>
              </div>
            ))}
          </div>

          {CATS.map(cat => (
            <div key={cat.key} style={s.rubricRow}>
              <div style={s.rubricCat}>{cat.label}</div>
              <div style={s.rubricLevels}>
                {RUBRIC_DETAIL[cat.key].map((desc, i) => {
                  const level = RUBRIC_LEVELS[i]
                  return (
                    <div key={i} style={{ ...s.rubricCell, background:level.bg }}>
                      <div style={{ fontSize:'10px', fontWeight:600, color:level.color, marginBottom:'4px' }}>
                        {level.range} · {level.label}
                      </div>
                      <div style={{ fontSize:'12px', color:'var(--color-text-primary)', lineHeight:'1.5' }}>
                        {desc}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Floors sit outside the weighted arithmetic: each is a firing
              offence in a live centre, so it cannot be a points deduction.
              Assessors need them on the same page as the descriptors, or
              they get applied inconsistently between reviewers. */}
          <div style={s.floorsBox}>
            <div style={s.floorsTitle}>Governance floors — fail the call regardless of weighted score</div>
            {[
              ['Verification not completed', 'Account information released, or an account change made, without completing the verification standard in force. A caller-volunteered factor does not count as verification.'],
              ['Prohibited data recorded', 'A full card number or other restricted identifier typed into a note, ticket, or any free-text field.'],
            ].map(([title, detail]) => (
              <div key={title} style={s.floorRow}>
                <span style={s.floorPill}>FAIL</span>
                <div>
                  <div style={s.floorName}>{title}</div>
                  <div style={s.floorDetail}>{detail}</div>
                </div>
              </div>
            ))}
            <div style={s.floorNote}>
              Record these as <em>not yet ready</em> and have the candidate retake the call —
              they are a readiness gate, not a punishment. A floor can only be lifted by an
              administrator, who is recorded against the override along with their reason;
              trainers escalate rather than clear it themselves.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const s = {
  page:       { fontFamily:"'DM Sans', sans-serif", maxWidth:'900px' },
  loading:    { padding:'40px', color:'var(--color-text-secondary)', fontSize:'14px' },
  headerRow:  { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'18px', gap:'16px', flexWrap:'wrap' },
  title:      { fontSize:'20px', fontWeight:500, color:'var(--color-text-primary)', marginBottom:'3px' },
  sub:        { fontSize:'13px', color:'var(--color-text-secondary)' },
  cohortSelector: { display:'flex', flexDirection:'column', gap:'5px' },
  label:      { fontSize:'11px', fontWeight:600, color:'var(--color-text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' },
  input:      { padding:'8px 10px', border:'1px solid #CBD8E6', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans', sans-serif", color:'var(--color-text-primary)', background:'var(--color-background-primary)' },
  tabRow:     { display:'flex', gap:'2px', marginBottom:'14px', background:'var(--color-background-secondary)', borderRadius:'10px', padding:'3px', width:'fit-content' },
  tab:        { padding:'6px 16px', border:'none', borderRadius:'8px', background:'transparent', color:'var(--color-text-secondary)', fontSize:'13px', fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans', sans-serif", transition:'all 0.15s' },
  tabActive:  { background:'var(--color-background-primary)', color:'var(--color-text-primary)', boxShadow:'0 1px 3px rgba(0,0,0,0.08)' },
  card:       { background:'var(--color-background-primary)', border:'1px solid #CBD8E6', borderRadius:'16px', padding:'22px' },
  weightBar:  { height:'28px', borderRadius:'8px', overflow:'hidden', display:'flex', marginBottom:'8px' },
  weightBarLegend: { display:'flex', flexWrap:'wrap', gap:'10px', marginBottom:'18px' },
  divider:    { height:'1px', background:'var(--color-border-tertiary)', margin:'6px 0 18px' },
  weightRow:  { display:'flex', alignItems:'center', gap:'16px', padding:'12px 0', borderBottom:'1px solid var(--color-border-tertiary)' },
  weightLeft: { flex:1 },
  weightLabel:{ fontSize:'13px', fontWeight:500, color:'var(--color-text-primary)', marginBottom:'2px' },
  weightDesc: { fontSize:'11px', color:'var(--color-text-tertiary)' },
  weightControls: { display:'flex', alignItems:'center', gap:'10px', flexShrink:0 },
  totalRow:   { display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'18px', paddingTop:'18px', borderTop:'1px solid var(--color-border-tertiary)', flexWrap:'wrap', gap:'10px' },
  totalPill:  { fontSize:'13px', fontWeight:600, padding:'6px 14px', borderRadius:'20px' },
  btn:        { padding:'8px 16px', border:'1px solid #CBD8E6', borderRadius:'8px', background:'var(--color-background-primary)', color:'var(--color-text-primary)', fontSize:'13px', fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" },
  btnPrimary: { padding:'8px 18px', border:'none', borderRadius:'8px', background:'#0D1B2A', color:'#fff', fontSize:'13px', fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans', sans-serif", transition:'opacity 0.15s' },
  certNote:   { marginTop:'16px', background:'var(--color-background-secondary)', borderRadius:'10px', padding:'12px 14px', fontSize:'12px', color:'var(--color-text-secondary)', lineHeight:'1.7' },
  errorBox:   { background:'#FAECE7', color:'#993C1D', borderRadius:'8px', padding:'10px 14px', fontSize:'13px', marginTop:'12px' },
  rubricRow:  { marginBottom:'16px', paddingBottom:'16px', borderBottom:'1px solid var(--color-border-tertiary)' },
  rubricCat:  { fontSize:'12px', fontWeight:600, color:'var(--color-text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' },
  rubricLevels: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' },
  rubricCell: { borderRadius:'8px', padding:'10px 12px' },
  floorsBox:  { marginTop:'18px', border:'1px solid #E8C4B8', borderRadius:'12px', padding:'16px 18px', background:'#FDF7F5' },
  floorsTitle:{ fontSize:'11px', fontWeight:600, color:'#993C1D', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'12px' },
  floorRow:   { display:'flex', gap:'10px', alignItems:'flex-start', marginBottom:'10px' },
  floorPill:  { fontSize:'9px', fontWeight:700, letterSpacing:'0.07em', padding:'3px 8px', borderRadius:'10px', background:'#993C1D', color:'#fff', flexShrink:0, marginTop:'1px' },
  floorName:  { fontSize:'13px', fontWeight:600, color:'var(--color-text-primary)' },
  floorDetail:{ fontSize:'12px', color:'var(--color-text-secondary)', lineHeight:'1.55', marginTop:'2px' },
  floorNote:  { fontSize:'11.5px', color:'#7A4A38', lineHeight:'1.6', marginTop:'4px', paddingTop:'10px', borderTop:'1px solid #F0DDD6' },
}
