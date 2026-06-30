// src/pages/CallSimulator.jsx
// ── Morpheus CRM — AI Call Simulator (Sprint 3) ─────────────────
// Used by BOTH trainer shell and participant shell.
// Props control which context it runs in.
//
// Trainer:    <CallSimulator role="trainer" participants={[...]} staffProfileId="uuid" />
// Participant: <CallSimulator role="participant" participantId="uuid" cohortId="uuid" />

import { useState, useRef, useEffect } from 'react'
import { useCallSession, CALL_STATES } from '../hooks/useCallSession.js'
import { getScoreWeights, updateScoreWeights } from '../lib/db.js'

const SCENARIO_TYPES = [
  'Billing dispute – frustrated customer',
  'Account setup – confused first-time caller',
  'Service outage – angry escalation',
  'Returns / refund request',
  'General inquiry – friendly caller',
  'Complaint escalation – request for supervisor',
  'Payment processing error – urgent resolution',
]

const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced']

const CATS = [
  { key: 'opening',    label: 'Opening / Greeting',  weight: 15 },
  { key: 'listening',  label: 'Active Listening',     weight: 20 },
  { key: 'empathy',    label: 'Empathy & Tone',       weight: 20 },
  { key: 'resolution', label: 'Problem Resolution',   weight: 25 },
  { key: 'policy',     label: 'Policy Adherence',     weight: 10 },
  { key: 'closing',    label: 'Closing',              weight: 10 },
]

function scoreColor(s) {
  if (s == null) return 'var(--color-border-secondary)'
  if (s >= 80) return '#0F6E56'
  if (s >= 60) return '#BA7517'
  return '#993C1D'
}
function scoreBg(s) {
  if (s == null) return 'var(--color-background-secondary)'
  if (s >= 80) return '#E1F5EE'
  if (s >= 60) return '#FAEEDA'
  return '#FAECE7'
}
function scoreLabel(s) {
  if (s == null) return '—'
  if (s >= 80) return 'Proficient'
  if (s >= 60) return 'Developing'
  return 'Needs work'
}

export default function CallSimulator({
  role = 'trainer',
  participants = [],
  staffProfileId = null,
  participantId: propParticipantId = null,
  cohortId: propCohortId = null,
}) {
  const isTrainer = role === 'trainer'

  // Trainer selects participant; participant is fixed
  const [selectedParticipantId, setSelectedParticipantId] = useState(
    propParticipantId ?? participants[0]?.participant_id ?? null
  )
  const [selectedCohortId] = useState(propCohortId ?? null)
  const [scenarioType, setScenarioType] = useState(SCENARIO_TYPES[0])
  const [difficulty, setDifficulty]     = useState('Intermediate')
  const [inputVal, setInputVal]         = useState('')
  const [trainerNote, setTrainerNote]   = useState('')
  const [savingNote, setSavingNote]     = useState(false)
  const [weights, setWeights]           = useState(null)
  const transcriptRef = useRef(null)

  const activeParticipantId = isTrainer ? selectedParticipantId : propParticipantId

  const call = useCallSession({
    participantId: activeParticipantId,
    cohortId:      selectedCohortId,
    scoredBy:      isTrainer ? staffProfileId : null,
  })

  // Load score weights
  useEffect(() => {
    getScoreWeights(selectedCohortId).then(w => setWeights(w)).catch(() => {})
  }, [selectedCohortId])

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [call.messages])

  async function handleGenerate() {
    if (!activeParticipantId) return
    await call.generate(scenarioType, difficulty)
  }

  async function handleSend() {
    const v = inputVal.trim()
    if (!v) return
    setInputVal('')
    await call.sendResponse(v)
  }

  async function handleSaveNote() {
    if (!call.sessionId || !trainerNote.trim()) return
    setSavingNote(true)
    try {
      const { supabase } = await import('../lib/supabase.js')
      await supabase.from('call_scores')
        .update({ trainer_notes: trainerNote })
        .eq('session_id', call.sessionId)
    } catch(e) { console.error(e) }
    finally { setSavingNote(false) }
  }

  const catScores = call.scores ? {
    opening: call.scores.opening, listening: call.scores.listening,
    empathy: call.scores.empathy, resolution: call.scores.resolution,
    policy: call.scores.policy,   closing: call.scores.closing,
  } : null

  return (
    <div style={s.page}>
      <div style={s.grid}>

        {/* ── Left column ── */}
        <div style={s.leftCol}>

          {/* Setup card */}
          <div style={s.card}>
            <div style={s.cardTitle}>
              {isTrainer ? 'Session setup' : 'Choose your scenario'}
            </div>

            {isTrainer && (
              <div style={s.fg}>
                <label style={s.label}>Participant <span style={s.req}>*</span></label>
                <select style={s.input}
                  value={selectedParticipantId ?? ''}
                  onChange={e => setSelectedParticipantId(e.target.value)}
                  disabled={call.isActive || call.isScoring}>
                  <option value="">Select participant…</option>
                  {participants.map(p => (
                    <option key={p.participant_id} value={p.participant_id}>
                      {p.full_name} — {p.cts_id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', margin:'12px 0' }}>
              <div style={s.fg}>
                <label style={s.label}>Scenario type</label>
                <select style={s.input} value={scenarioType}
                  onChange={e => setScenarioType(e.target.value)}
                  disabled={call.isActive || call.isScoring}>
                  {SCENARIO_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={s.fg}>
                <label style={s.label}>Difficulty</label>
                <select style={s.input} value={difficulty}
                  onChange={e => setDifficulty(e.target.value)}
                  disabled={call.isActive || call.isScoring}>
                  {DIFFICULTIES.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>

            {/* Scenario brief */}
            <div style={s.fg}>
              <label style={s.label}>Scenario brief</label>
              <div style={{
                ...s.brief,
                ...(call.scenario ? s.briefLoaded : {}),
                ...(call.isGenerating ? s.briefLoading : {}),
              }}>
                {call.isGenerating
                  ? '⏳  Generating scenario…'
                  : call.scenario
                    ? call.scenario.brief
                    : 'Generate a scenario to see the call brief.'}
              </div>
            </div>

            {call.error && <div style={s.errorBox}>{call.error}</div>}

            <div style={{ display:'flex', gap:'8px', marginTop:'12px', alignItems:'center' }}>
              <button style={s.btnPrimary}
                disabled={call.isGenerating || call.isActive || call.isScoring || !activeParticipantId}
                onClick={handleGenerate}>
                {call.isGenerating ? 'Generating…' : 'Generate scenario'}
              </button>
              {call.isComplete && (
                <button style={s.btn} onClick={call.reset}>New session</button>
              )}
              {call.sessionId && (
                <span style={s.sessionId}>
                  Session {call.sessionId.slice(0,8).toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {/* Call card */}
          <div style={{ ...s.card, display:'flex', flexDirection:'column', flex:1 }}>
            {/* Call status bar */}
            <div style={s.callBar}>
              <div style={{
                ...s.liveDot,
                background: call.isActive ? '#27C080' : 'var(--color-border-secondary)',
                boxShadow: call.isActive ? '0 0 0 3px rgba(39,192,128,0.2)' : 'none',
              }} />
              <span style={s.callStatusText}>
                {call.isIdle       ? 'Generate a scenario to begin'           : ''}
                {call.isGenerating ? 'Generating scenario…'                   : ''}
                {call.isReady      ? `Ready — caller: ${call.scenario?.caller_name}` : ''}
                {call.isActive     ? `Live call · ${call.scenario?.caller_name} on the line` : ''}
                {call.isScoring    ? 'Scoring call against rubric…'           : ''}
                {call.isComplete   ? 'Call complete — scored & saved to Morpheus' : ''}
                {call.isError      ? 'Error — see message above'              : ''}
              </span>
              <div style={{ display:'flex', gap:'7px' }}>
                {call.isReady && (
                  <button style={s.btnTeal} onClick={call.startCall}>Start call</button>
                )}
                {call.isActive && (
                  <button style={{ ...s.btn, borderColor:'#CBD8E6' }} onClick={call.endCall}>
                    End & score
                  </button>
                )}
              </div>
            </div>

            {/* Transcript */}
            <div style={s.transcript} ref={transcriptRef}>
              {call.messages.length === 0 && (
                <div style={s.empty}>
                  {call.isReady
                    ? `${call.scenario?.caller_name} is waiting — click "Start call" above.`
                    : 'Your call transcript will appear here.'}
                </div>
              )}
              {call.messages.map(m => (
                <div key={m.id} style={{ marginBottom:'12px' }}>
                  <div style={{
                    fontSize:'10px', fontWeight:600, textTransform:'uppercase',
                    letterSpacing:'0.07em', marginBottom:'4px',
                    color: m.role === 'rep'    ? '#2176AE'
                         : m.role === 'typing' ? 'var(--color-text-tertiary)'
                         : '#993C1D',
                  }}>
                    {m.role === 'typing' ? `${m.name} is typing…` : m.name}
                  </div>
                  {m.role !== 'typing' && (
                    <span style={{
                      display:'inline-block', maxWidth:'88%',
                      padding:'9px 12px', borderRadius:'10px',
                      fontSize:'13px', lineHeight:'1.6',
                      background: m.role === 'rep' ? '#E6F1FB' : 'var(--color-background-secondary)',
                      color: m.role === 'rep' ? '#0C447C' : 'var(--color-text-primary)',
                    }}>
                      {m.text}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Input */}
            {call.isActive && (
              <div style={{ display:'flex', gap:'8px', marginTop:'12px' }}>
                <input style={{ ...s.input, flex:1 }}
                  value={inputVal}
                  placeholder="Type your CSR response…"
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  autoFocus
                />
                <button style={s.btnPrimary} onClick={handleSend}>Send</button>
              </div>
            )}

            {/* Trainer note (post-call) */}
            {isTrainer && call.isComplete && (
              <div style={{ marginTop:'12px', paddingTop:'12px', borderTop:'1px solid var(--color-border-tertiary)' }}>
                <label style={s.label}>Trainer notes (optional — saved to participant record)</label>
                <div style={{ display:'flex', gap:'8px', marginTop:'6px' }}>
                  <input style={{ ...s.input, flex:1 }}
                    placeholder="Add observation or feedback for this session…"
                    value={trainerNote}
                    onChange={e => setTrainerNote(e.target.value)}
                  />
                  <button style={s.btn} disabled={savingNote || !trainerNote.trim()} onClick={handleSaveNote}>
                    {savingNote ? 'Saving…' : 'Save note'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Score panel ── */}
        <div style={s.scorePanel}>
          <div style={s.cardTitle}>
            {isTrainer ? 'Live scoring matrix' : 'Your score'}
          </div>

          {CATS.map(cat => {
            const val = catScores?.[cat.key] ?? null
            const color = scoreColor(val)
            return (
              <div key={cat.key} style={{ marginBottom:'14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                  <span style={{ fontSize:'12px', color:'var(--color-text-secondary)' }}>
                    {cat.label}
                    <span style={{ fontSize:'10px', color:'var(--color-text-tertiary)', marginLeft:'4px' }}>
                      ({weights ? Math.round(weights[`weight_${cat.key}`]) : cat.weight}%)
                    </span>
                  </span>
                  <span style={{ fontSize:'12px', fontWeight:600, fontFamily:'monospace', color }}>
                    {val ?? '—'}
                  </span>
                </div>
                <div style={{ height:'6px', background:'var(--color-background-secondary)', borderRadius:'3px', overflow:'hidden' }}>
                  <div style={{
                    height:'100%', width:`${val ?? 0}%`,
                    background: color, borderRadius:'3px',
                    transition:'width 0.9s cubic-bezier(0.34,1.56,0.64,1)',
                  }} />
                </div>
              </div>
            )
          })}

          <div style={s.totalBox}>
            <div style={{
              fontSize:'46px', fontWeight:300, fontFamily:'monospace',
              lineHeight:1,
              color: call.scores ? scoreColor(call.scores.total) : 'var(--color-text-tertiary)',
            }}>
              {call.scores ? call.scores.total : '—'}
            </div>
            <div style={{ fontSize:'11px', color:'var(--color-text-tertiary)', marginTop:'4px' }}>
              overall score / 100
            </div>
            {call.scores && (
              <div style={{
                marginTop:'6px', fontSize:'11px', fontWeight:600,
                padding:'3px 10px', borderRadius:'20px', display:'inline-block',
                background: scoreBg(call.scores.total),
                color: scoreColor(call.scores.total),
              }}>
                {scoreLabel(call.scores.total)}
              </div>
            )}
            {call.scores?.feedback && (
              <div style={s.feedbackBox}>{call.scores.feedback}</div>
            )}
            {call.isComplete && (
              <div style={s.dbSaved}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <ellipse cx="6" cy="3.5" rx="5" ry="2.5" stroke="currentColor" strokeWidth="1"/>
                  <path d="M1 3.5v2.5c0 1.38 2.24 2.5 5 2.5s5-1.12 5-2.5V3.5" stroke="currentColor" strokeWidth="1" fill="none"/>
                  <path d="M1 6v2.5c0 1.38 2.24 2.5 5 2.5s5-1.12 5-2.5V6" stroke="currentColor" strokeWidth="1" fill="none"/>
                </svg>
                Saved to Morpheus
              </div>
            )}
            {call.certified && (
              <div style={s.certAlert}>
                🎓 Certification threshold met — issue certificate from participant profile.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

const s = {
  page:       { fontFamily:"'DM Sans', sans-serif", height:'100%' },
  grid:       { display:'grid', gridTemplateColumns:'1fr 290px', gap:'14px', height:'100%' },
  leftCol:    { display:'flex', flexDirection:'column', gap:'12px', minHeight:0 },
  card:       { background:'var(--color-background-primary,#fff)', border:'1px solid #CBD8E6', borderRadius:'16px', padding:'18px' },
  cardTitle:  { fontSize:'11px', fontWeight:600, color:'#4A6080', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'14px' },
  scorePanel: { background:'var(--color-background-primary,#fff)', border:'1px solid #CBD8E6', borderRadius:'16px', padding:'18px', display:'flex', flexDirection:'column' },
  fg:         { display:'flex', flexDirection:'column', gap:'5px' },
  label:      { fontSize:'11px', fontWeight:600, color:'#4A6080', textTransform:'uppercase', letterSpacing:'0.06em' },
  req:        { color:'#993C1D' },
  input:      { padding:'8px 10px', border:'1px solid #CBD8E6', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans', sans-serif", color:'#0D1B2A', background:'#fff', width:'100%' },
  brief:      { background:'#F7F9FC', border:'1px solid #E8EFF6', borderRadius:'8px', padding:'12px', fontSize:'13px', color:'#8BA0B8', minHeight:'65px', lineHeight:'1.6' },
  briefLoaded:{ background:'#E6F1FB', borderColor:'#B5D4F4', color:'#0D1B2A' },
  briefLoading:{ color:'#4A6080' },
  errorBox:   { background:'#FAECE7', color:'#993C1D', borderRadius:'8px', padding:'10px 12px', fontSize:'13px', marginTop:'10px', lineHeight:'1.5' },
  sessionId:  { fontSize:'10px', color:'#8BA0B8', fontFamily:'monospace' },
  callBar:    { display:'flex', alignItems:'center', gap:'9px', marginBottom:'12px', paddingBottom:'12px', borderBottom:'1px solid #F0F4F8' },
  liveDot:    { width:'9px', height:'9px', borderRadius:'50%', flexShrink:0, transition:'all 0.3s' },
  callStatusText: { fontSize:'13px', fontWeight:500, color:'#4A6080', flex:1 },
  transcript: { flex:1, minHeight:'190px', maxHeight:'300px', overflowY:'auto', paddingRight:'4px' },
  empty:      { color:'#8BA0B8', fontSize:'13px', fontStyle:'italic', paddingTop:'8px' },
  btn:        { padding:'8px 14px', border:'1px solid #CBD8E6', borderRadius:'8px', background:'#fff', color:'#0D1B2A', fontSize:'12px', fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans', sans-serif", whiteSpace:'nowrap' },
  btnPrimary: { padding:'8px 16px', border:'none', borderRadius:'8px', background:'#0D1B2A', color:'#fff', fontSize:'13px', fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" },
  btnTeal:    { padding:'7px 14px', border:'none', borderRadius:'8px', background:'#0F6E56', color:'#fff', fontSize:'12px', fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" },
  totalBox:   { marginTop:'auto', paddingTop:'16px', borderTop:'1px solid #F0F4F8', textAlign:'center' },
  feedbackBox:{ background:'#F7F9FC', border:'1px solid #E8EFF6', borderRadius:'8px', padding:'10px 12px', fontSize:'12px', color:'#4A6080', lineHeight:'1.6', marginTop:'10px', textAlign:'left' },
  dbSaved:    { display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', marginTop:'10px', fontSize:'11px', color:'#0F6E56', background:'#E1F5EE', padding:'6px 12px', borderRadius:'20px' },
  certAlert:  { marginTop:'10px', background:'#FAEEDA', color:'#854F0B', borderRadius:'8px', padding:'10px 12px', fontSize:'12px', lineHeight:'1.5', textAlign:'left' },
}
