// src/pages/ParticipantShell.jsx
// ── Morpheus CRM — Participant Self-Service Portal ──────────────

import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { getParticipantProfile, getCallHistory, checkCertEligibility } from '../lib/db.js'
import { useCallSession, CALL_STATES } from '../hooks/useCallSession.js'

const SCENARIO_TYPES = [
  'Billing dispute – frustrated customer',
  'Account setup – confused first-time caller',
  'Service outage – angry escalation',
  'Returns / refund request',
  'General inquiry – friendly caller',
]
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced']
const CATS = ['Opening','Listening','Empathy','Resolution','Policy','Closing']
const SCORE_KEYS = ['score_opening','score_listening','score_empathy','score_resolution','score_policy','score_closing']

function scoreColor(s) {
  if (s >= 80) return '#0F6E56'
  if (s >= 60) return '#BA7517'
  return '#993C1D'
}

export default function ParticipantShell() {
  const { user, participantId } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [profile, setProfile]         = useState(null)
  const [callHistory, setCallHistory] = useState([])
  const [eligibility, setEligibility] = useState(null)

  useEffect(() => {
    if (!participantId) return
    async function load() {
      const [p, h, e] = await Promise.all([
        getParticipantProfile(participantId),
        getCallHistory(participantId, 20),
        checkCertEligibility(participantId),
      ])
      setProfile(p)
      setCallHistory(h)
      setEligibility(e)
    }
    load()
  }, [participantId])

  const NAV = [
    { path: '/',       label: 'My Dashboard' },
    { path: '/calls',  label: 'Practice Calls' },
    { path: '/progress', label: 'My Progress' },
  ]

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const completedCalls = callHistory.filter(c => c.call_scores?.length)
  const avgScore = completedCalls.length
    ? Math.round(completedCalls.reduce((s,c) => s + (c.call_scores[0]?.total_score ?? 0), 0) / completedCalls.length)
    : null

  return (
    <div style={sh.app}>
      <aside style={sh.sidebar}>
        <div style={sh.logoArea}>
          <div style={sh.logoM}>M<span style={sh.logoAccent}>.</span>orpheus</div>
          <div style={sh.logoSub}>Participant portal</div>
        </div>
        <nav style={sh.nav}>
          <div style={sh.navSection}>My training</div>
          {NAV.map(item => {
            const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
            return (
              <div key={item.path} style={{ ...sh.navItem, ...(active ? sh.navActive : {}) }}
                onClick={() => navigate(item.path)}>
                {item.label}
              </div>
            )
          })}
        </nav>
        <div style={sh.userArea}>
          <div style={sh.userName}>{profile?.full_name ?? user?.email}</div>
          <div style={sh.userSub}>{profile?.cts_id} · {profile?.program_source}</div>
          <button style={sh.signOutBtn} onClick={() => signOut().then(() => navigate('/login'))}>Sign out</button>
        </div>
      </aside>

      <main style={sh.main}>
        <div style={sh.topbar}>
          <span style={sh.topbarTitle}>
            {NAV.find(n => n.path === '/' ? location.pathname === '/' : location.pathname.startsWith(n.path))?.label ?? 'Portal'}
          </span>
          {eligibility?.already_certified && (
            <span style={sh.certPill}>✓ CX Representative Certified</span>
          )}
        </div>

        <div style={sh.content}>
          <Routes>
            <Route path="/" element={
              <PortalDashboard
                firstName={firstName}
                profile={profile}
                callHistory={callHistory}
                completedCalls={completedCalls}
                avgScore={avgScore}
                eligibility={eligibility}
                navigate={navigate}
              />
            } />
            <Route path="/calls" element={
              <PracticeCallsPage participantId={participantId} onComplete={(newCall) => setCallHistory(prev => [newCall, ...prev])} />
            } />
            <Route path="/progress" element={
              <ProgressPage completedCalls={completedCalls} avgScore={avgScore} />
            } />
          </Routes>
        </div>
      </main>
    </div>
  )
}

// ── Portal dashboard ──────────────────────────────────────────
function PortalDashboard({ firstName, profile, callHistory, completedCalls, avgScore, eligibility, navigate }) {
  const scoreColor = s => s >= 80 ? '#0F6E56' : s >= 60 ? '#BA7517' : '#993C1D'
  const isCert = eligibility?.already_certified
  const isElig = eligibility?.is_eligible && !isCert

  return (
    <div>
      {/* Hero */}
      <div style={sh.hero}>
        <div style={sh.heroGreeting}>Good day, {firstName} 👋</div>
        <div style={sh.heroSub}>{profile?.cohort ?? 'CTS Training'} · Trainer: {profile?.staff_profiles?.full_name ?? '—'}</div>
        <div style={sh.heroStats}>
          <div style={sh.hstat}><div style={sh.hstatVal}>{completedCalls.length}</div><div style={sh.hstatLabel}>Calls done</div></div>
          <div style={sh.hstat}><div style={{ ...sh.hstatVal, color:'#5DCAA5' }}>{avgScore ?? '—'}</div><div style={sh.hstatLabel}>Avg score</div></div>
          <div style={sh.hstat}><div style={sh.hstatVal}>80</div><div style={sh.hstatLabel}>Cert threshold</div></div>
        </div>
      </div>

      {/* Cert / eligibility banner */}
      {isCert && (
        <div style={{ ...sh.banner, background:'#0F6E56' }}>
          <span style={{ fontSize:'18px' }}>🎓</span>
          <div>
            <div style={{ fontWeight:500, fontSize:'14px' }}>CX Representative Certificate issued</div>
            <div style={{ fontSize:'12px', opacity:0.75, marginTop:'2px' }}>Certified Training Standards · Albany, NY</div>
          </div>
        </div>
      )}
      {isElig && (
        <div style={{ ...sh.banner, background:'#BA7517' }}>
          <span style={{ fontSize:'18px' }}>⭐</span>
          <div>
            <div style={{ fontWeight:500, fontSize:'14px' }}>You're eligible for certification!</div>
            <div style={{ fontSize:'12px', opacity:0.8, marginTop:'2px' }}>Contact your trainer to initiate the certificate issuance.</div>
          </div>
        </div>
      )}

      <button style={sh.startBtn} onClick={() => navigate('/calls')}>Start a practice call →</button>

      {/* Recent calls */}
      <div style={sh.card}>
        <div style={sh.cardTitle}>Recent calls</div>
        {completedCalls.length === 0 && <div style={sh.empty}>No calls completed yet. Start your first practice call above.</div>}
        {completedCalls.slice(0,5).map(c => {
          const total = c.call_scores[0]?.total_score ?? 0
          return (
            <div key={c.id} style={sh.callRow}>
              <span style={sh.callDate}>{new Date(c.started_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
              <span style={sh.callScenario}>{c.scenario_type}</span>
              <span style={{ ...sh.callScore, color:scoreColor(total), background: total>=80?'#E1F5EE':total>=60?'#FAEEDA':'#FAECE7' }}>{total}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Practice calls page ───────────────────────────────────────
function PracticeCallsPage({ participantId, onComplete }) {
  const [scenarioType, setScenarioType] = useState(SCENARIO_TYPES[0])
  const [difficulty, setDifficulty]     = useState('Intermediate')
  const [inputVal, setInputVal]         = useState('')

  const call = useCallSession({ participantId, cohortId: null, scoredBy: null })

  async function handleGenerate() {
    await call.generate(scenarioType, difficulty)
  }

  async function handleSend() {
    if (!inputVal.trim()) return
    const v = inputVal; setInputVal('')
    await call.sendResponse(v)
  }

  const catScores = call.scores
    ? [call.scores.opening, call.scores.listening, call.scores.empathy,
       call.scores.resolution, call.scores.policy, call.scores.closing]
    : null

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:'14px' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
        {/* Setup */}
        <div style={sh.card}>
          <div style={sh.cardTitle}>Choose your scenario</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
            <div>
              <label style={sh.label}>Scenario type</label>
              <select style={sh.input} value={scenarioType} onChange={e => setScenarioType(e.target.value)}
                disabled={call.isActive || call.isScoring}>
                {SCENARIO_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={sh.label}>Difficulty</label>
              <select style={sh.input} value={difficulty} onChange={e => setDifficulty(e.target.value)}
                disabled={call.isActive || call.isScoring}>
                {DIFFICULTIES.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div style={{ ...sh.brief, ...(call.scenario ? sh.briefLoaded : {}) }}>
            {call.isGenerating ? '⏳ Generating your scenario…' :
             call.scenario ? call.scenario.brief :
             'Click "Generate scenario" to get your practice call brief.'}
          </div>
          {call.error && <div style={sh.errorBox}>{call.error}</div>}
          <div style={{ display:'flex', gap:'8px', marginTop:'10px' }}>
            <button style={sh.btnPrimary} onClick={handleGenerate}
              disabled={call.isGenerating || call.isActive || call.isScoring}>
              {call.isGenerating ? 'Generating…' : 'Generate scenario'}
            </button>
            {call.isComplete && (
              <button style={sh.btn} onClick={call.reset}>Start over</button>
            )}
          </div>
        </div>

        {/* Call area */}
        <div style={{ ...sh.card, flex:1, display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'9px', marginBottom:'12px', paddingBottom:'12px', borderBottom:'1px solid #F0F4F8' }}>
            <div style={{ width:'9px', height:'9px', borderRadius:'50%', background: call.isActive ? '#27C080' : '#CBD8E6', transition:'all 0.3s', flexShrink:0, ...(call.isActive ? { boxShadow:'0 0 0 3px rgba(39,192,128,0.2)' } : {}) }} />
            <span style={{ fontSize:'13px', fontWeight:500, color:'#4A6080', flex:1 }}>
              {call.isIdle || call.isGenerating ? 'Generate a scenario to begin' :
               call.isReady ? 'Ready — click Start call' :
               call.isActive ? 'Call in progress — you are the CSR' :
               call.isScoring ? 'Scoring your call…' :
               call.isComplete ? 'Call complete — see your score →' :
               'Error — please try again'}
            </span>
            {call.isReady && <button style={sh.btnTeal} onClick={call.startCall}>Start call</button>}
            {call.isActive && <button style={sh.btn} onClick={call.endCall}>End call & score</button>}
          </div>

          <div style={{ flex:1, minHeight:'200px', maxHeight:'280px', overflowY:'auto' }}>
            {call.messages.length === 0 && <div style={sh.empty}>Your call transcript will appear here.</div>}
            {call.messages.map(m => (
              <div key={m.id} style={{ marginBottom:'10px' }}>
                <div style={{ fontSize:'10px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'3px', color: m.role==='rep' ? '#2176AE' : m.role==='typing' ? '#8BA0B8' : '#993C1D' }}>
                  {m.role === 'typing' ? `${m.name} is typing…` : m.name}
                </div>
                {m.role !== 'typing' && (
                  <span style={{ display:'inline-block', maxWidth:'88%', padding:'8px 11px', borderRadius:'10px', fontSize:'13px', lineHeight:'1.55', background: m.role==='rep' ? '#E6F1FB' : '#F7F9FC', color: m.role==='rep' ? '#0C447C' : '#0D1B2A' }}>
                    {m.text}
                  </span>
                )}
              </div>
            ))}
          </div>

          {call.isActive && (
            <div style={{ display:'flex', gap:'8px', marginTop:'10px' }}>
              <input style={{ ...sh.input, flex:1 }} value={inputVal}
                placeholder="Type your response as the CSR…"
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()} />
              <button style={sh.btnPrimary} onClick={handleSend}>Send</button>
            </div>
          )}
        </div>
      </div>

      {/* Score panel */}
      <div style={{ ...sh.card, display:'flex', flexDirection:'column' }}>
        <div style={sh.cardTitle}>Your score</div>
        {CATS.map((cat, i) => {
          const val = catScores?.[i] ?? null
          const color = val != null ? scoreColor(val) : '#CBD8E6'
          return (
            <div key={cat} style={{ marginBottom:'12px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'4px' }}>
                <span style={{ color:'#4A6080' }}>{cat}</span>
                <span style={{ fontWeight:600, color, fontFamily:"'DM Mono',monospace" }}>{val ?? '—'}</span>
              </div>
              <div style={{ height:'6px', background:'#F0F4F8', borderRadius:'3px', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${val ?? 0}%`, background:color, borderRadius:'3px', transition:'width 0.8s ease' }} />
              </div>
            </div>
          )
        })}
        <div style={{ marginTop:'auto', paddingTop:'14px', borderTop:'1px solid #F0F4F8', textAlign:'center' }}>
          <div style={{ fontSize:'40px', fontWeight:300, fontFamily:"'DM Mono',monospace", color: call.scores ? scoreColor(call.scores.total) : '#CBD8E6' }}>
            {call.scores ? call.scores.total : '—'}
          </div>
          <div style={{ fontSize:'11px', color:'#8BA0B8', marginTop:'3px' }}>overall score / 100</div>
          {call.scores?.feedback && (
            <div style={{ marginTop:'10px', background:'#F7F9FC', borderRadius:'8px', padding:'10px', fontSize:'12px', color:'#4A6080', lineHeight:'1.6', textAlign:'left' }}>
              {call.scores.feedback}
            </div>
          )}
          {call.isComplete && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', marginTop:'10px', fontSize:'11px', color:'#0F6E56', background:'#E1F5EE', padding:'6px 12px', borderRadius:'20px' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1C3.24 1 1 2.12 1 3.5S3.24 6 6 6s5-1.12 5-2.5S8.76 1 6 1z" stroke="currentColor" strokeWidth="1"/><path d="M1 3.5v2C1 6.88 3.24 8 6 8s5-1.12 5-2.5v-2" stroke="currentColor" strokeWidth="1"/><path d="M1 5.5v2C1 8.88 3.24 10 6 10s5-1.12 5-2.5v-2" stroke="currentColor" strokeWidth="1"/></svg>
              Saved to your Morpheus record
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Progress page ─────────────────────────────────────────────
function ProgressPage({ completedCalls, avgScore }) {
  const scoreColor = s => s >= 80 ? '#0F6E56' : s >= 60 ? '#BA7517' : '#993C1D'
  const catAvgs = ['score_opening','score_listening','score_empathy','score_resolution','score_policy','score_closing']
    .map(key => completedCalls.length
      ? Math.round(completedCalls.reduce((s,c) => s+(c.call_scores[0]?.[key]??0),0)/completedCalls.length) : null)

  return (
    <div>
      <div style={{ ...sh.card, marginBottom:'14px' }}>
        <div style={sh.cardTitle}>Performance by category</div>
        {CATS.map((cat, i) => {
          const avg = catAvgs[i]
          const color = avg != null ? scoreColor(avg) : '#CBD8E6'
          return (
            <div key={cat} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px' }}>
              <span style={{ fontSize:'12px', color:'#4A6080', width:'100px', flexShrink:0 }}>{cat}</span>
              <div style={{ flex:1, height:'7px', background:'#F0F4F8', borderRadius:'3px', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${avg??0}%`, background:color, borderRadius:'3px', transition:'width 0.6s ease' }} />
              </div>
              <span style={{ fontSize:'13px', fontWeight:600, color, fontFamily:"'DM Mono',monospace", width:'28px', textAlign:'right' }}>{avg ?? '—'}</span>
            </div>
          )
        })}
      </div>

      <div style={{ background:'#fff', border:'1px solid #CBD8E6', borderRadius:'16px', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead><tr style={{ background:'#F7F9FC' }}>
            {['Date','Scenario','Difficulty','Score','Level'].map(h => (
              <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontWeight:500, fontSize:'11px', color:'#4A6080', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid #CBD8E6' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {completedCalls.map((c, i) => {
              const total = c.call_scores[0]?.total_score ?? 0
              const color = scoreColor(total)
              return (
                <tr key={c.id} style={{ borderBottom: i<completedCalls.length-1?'1px solid #F0F4F8':'none' }}>
                  <td style={{ padding:'10px 14px', fontFamily:"'DM Mono',monospace", fontSize:'11px', color:'#8BA0B8' }}>
                    {new Date(c.started_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                  </td>
                  <td style={{ padding:'10px 14px', color:'#0D1B2A' }}>{c.scenario_type}</td>
                  <td style={{ padding:'10px 14px', color:'#4A6080', fontSize:'12px' }}>{c.difficulty}</td>
                  <td style={{ padding:'10px 14px', fontWeight:700, color, fontFamily:"'DM Mono',monospace" }}>{total}</td>
                  <td style={{ padding:'10px 14px' }}>
                    <span style={{ fontSize:'10px', fontWeight:600, padding:'2px 8px', borderRadius:'10px', background: total>=80?'#E1F5EE':total>=60?'#FAEEDA':'#FAECE7', color }}>
                      {total>=80?'Proficient':total>=60?'Developing':'Needs work'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────
const sh = {
  app:        { display:'flex', height:'100vh', overflow:'hidden', fontFamily:"'DM Sans',sans-serif" },
  sidebar:    { width:'210px', minWidth:'210px', background:'#0D1B2A', display:'flex', flexDirection:'column' },
  logoArea:   { padding:'20px 18px 14px', borderBottom:'1px solid rgba(255,255,255,0.08)' },
  logoM:      { fontFamily:"'DM Mono',monospace", fontSize:'20px', fontWeight:500, color:'#fff', letterSpacing:'-0.5px' },
  logoAccent: { color:'#5DCAA5' },
  logoSub:    { fontSize:'10px', color:'rgba(255,255,255,0.3)', letterSpacing:'0.06em', marginTop:'2px' },
  nav:        { padding:'12px 10px', flex:1 },
  navSection: { fontSize:'10px', color:'rgba(255,255,255,0.3)', letterSpacing:'0.1em', textTransform:'uppercase', padding:'10px 8px 6px' },
  navItem:    { padding:'9px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'13px', color:'rgba(255,255,255,0.55)', marginBottom:'1px', transition:'all 0.15s' },
  navActive:  { background:'rgba(93,202,165,0.18)', color:'#5DCAA5', fontWeight:500 },
  userArea:   { padding:'14px 12px', borderTop:'1px solid rgba(255,255,255,0.08)' },
  userName:   { fontSize:'12px', fontWeight:500, color:'rgba(255,255,255,0.75)', marginBottom:'2px' },
  userSub:    { fontSize:'10px', color:'rgba(255,255,255,0.3)', marginBottom:'10px' },
  signOutBtn: { background:'none', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'6px', color:'rgba(255,255,255,0.4)', fontSize:'11px', cursor:'pointer', padding:'5px 10px', fontFamily:"'DM Sans',sans-serif" },
  main:       { flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#F7F9FC' },
  topbar:     { background:'#fff', borderBottom:'1px solid #CBD8E6', padding:'0 24px', height:'52px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 },
  topbarTitle:{ fontSize:'15px', fontWeight:500, color:'#0D1B2A' },
  certPill:   { fontSize:'11px', fontWeight:600, padding:'4px 12px', borderRadius:'20px', background:'#E1F5EE', color:'#0F6E56' },
  content:    { flex:1, overflowY:'auto', padding:'22px' },
  hero:       { background:'#0D1B2A', borderRadius:'16px', padding:'22px 24px', marginBottom:'14px', color:'#fff' },
  heroGreeting:{ fontSize:'20px', fontWeight:300, marginBottom:'3px' },
  heroSub:    { fontSize:'12px', color:'rgba(255,255,255,0.4)', marginBottom:'16px' },
  heroStats:  { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px' },
  hstat:      { background:'rgba(255,255,255,0.07)', borderRadius:'8px', padding:'10px 14px' },
  hstatVal:   { fontSize:'22px', fontWeight:300, color:'#fff', fontFamily:"'DM Mono',monospace" },
  hstatLabel: { fontSize:'10px', color:'rgba(255,255,255,0.4)', marginTop:'2px' },
  banner:     { display:'flex', alignItems:'center', gap:'12px', borderRadius:'12px', padding:'14px 18px', marginBottom:'14px', color:'#fff' },
  startBtn:   { display:'inline-block', padding:'10px 20px', background:'#0D1B2A', color:'#fff', border:'none', borderRadius:'10px', fontSize:'13px', fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:'16px' },
  card:       { background:'#fff', border:'1px solid #CBD8E6', borderRadius:'16px', padding:'18px', marginBottom:'12px' },
  cardTitle:  { fontSize:'11px', fontWeight:600, color:'#4A6080', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'14px' },
  callRow:    { display:'flex', alignItems:'center', gap:'10px', padding:'9px 0', borderBottom:'1px solid #F0F4F8' },
  callDate:   { fontFamily:"'DM Mono',monospace", fontSize:'11px', color:'#8BA0B8', width:'50px', flexShrink:0 },
  callScenario:{ flex:1, fontSize:'13px', color:'#0D1B2A' },
  callScore:  { fontSize:'13px', fontWeight:700, padding:'2px 9px', borderRadius:'8px', fontFamily:"'DM Mono',monospace", flexShrink:0 },
  label:      { fontSize:'11px', fontWeight:600, color:'#4A6080', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:'5px' },
  input:      { padding:'8px 10px', border:'1px solid #CBD8E6', borderRadius:'8px', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", color:'#0D1B2A', background:'#fff', width:'100%' },
  brief:      { background:'#F7F9FC', border:'1px solid #E8EFF6', borderRadius:'8px', padding:'12px', fontSize:'13px', color:'#8BA0B8', minHeight:'60px', lineHeight:'1.6' },
  briefLoaded:{ background:'#E6F1FB', borderColor:'#B5D4F4', color:'#0D1B2A' },
  errorBox:   { background:'#FAECE7', color:'#993C1D', borderRadius:'8px', padding:'10px 12px', fontSize:'12px', marginTop:'10px' },
  btn:        { padding:'8px 14px', border:'1px solid #CBD8E6', borderRadius:'8px', background:'#fff', color:'#0D1B2A', fontSize:'12px', fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" },
  btnPrimary: { padding:'8px 16px', border:'none', borderRadius:'8px', background:'#0D1B2A', color:'#fff', fontSize:'13px', fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" },
  btnTeal:    { padding:'8px 14px', border:'none', borderRadius:'8px', background:'#0F6E56', color:'#fff', fontSize:'12px', fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" },
  empty:      { color:'#8BA0B8', fontSize:'13px', fontStyle:'italic' },
}
