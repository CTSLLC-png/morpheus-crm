// src/pages/TrainerShell.jsx  v2  (Sprint 3)
import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { getDashboardStats, getCohortOverview, getParticipantPerformance } from '../lib/db.js'
import ParticipantIntake   from './ParticipantIntake.jsx'
import ParticipantProfile  from './ParticipantProfile.jsx'
import CohortManagement    from './CohortManagement.jsx'
import CallSimulator       from './CallSimulator.jsx'
import ScoreMatrix         from './ScoreMatrix.jsx'
import AdminPanel          from './AdminPanel.jsx'

const NAV_BASE = [
  { path:'/',             label:'Dashboard',        icon:'grid'    },
  { path:'/simulator',   label:'AI Call Simulator', icon:'monitor' },
  { path:'/participants',label:'Participants',       icon:'users'   },
  { path:'/cohorts',     label:'Cohorts & Reports', icon:'chart'   },
  { path:'/matrix',      label:'Score Matrix',      icon:'table'   },
]
const ICONS = {
  grid:    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/></svg>,
  monitor: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 4a1 1 0 011-1h10a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.3"/><path d="M5 14h6M8 11v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  users:   <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/><path d="M1 13c0-2.76 2.24-5 5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="12" cy="11" r="3" stroke="currentColor" strokeWidth="1.3"/></svg>,
  chart:   <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 12L6 7l3 3 5-6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  table:   <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M1 4h14M1 8h14M1 12h14M4 1v14M12 1v14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  shield:  <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1l5 2v4c0 3-2 5.5-5 7C5 12.5 3 10 3 7V3l5-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
}

function scoreColor(s) { return s >= 80 ? '#0F6E56' : s >= 60 ? '#BA7517' : '#993C1D' }

export default function TrainerShell() {
  const { user, role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isAdmin  = role === 'super_admin'
  const NAV = isAdmin ? [...NAV_BASE, { path:'/admin', label:'Admin panel', icon:'shield' }] : NAV_BASE

  const [stats, setStats]               = useState(null)
  const [cohorts, setCohorts]           = useState([])
  const [participants, setParticipants] = useState([])
  const [staffProfileId, setStaffProfileId] = useState(null)

  useEffect(() => {
    Promise.all([getDashboardStats(), getCohortOverview(), getParticipantPerformance()])
      .then(([s,c,p]) => { setStats(s); setCohorts(c??[]); setParticipants(p??[]) })
    if (user?.id) {
      import('../lib/supabase.js').then(({ supabase }) =>
        supabase.from('staff_profiles').select('id').eq('user_id', user.id).single()
          .then(({ data }) => data && setStaffProfileId(data.id))
      )
    }
  }, [user?.id])

  const displayName = user?.email?.split('@')[0] ?? 'Trainer'
  const initials    = displayName.slice(0,2).toUpperCase()
  const currentLabel = NAV.find(n => n.path==='/' ? location.pathname==='/' : location.pathname.startsWith(n.path))?.label ?? 'Morpheus'

  return (
    <div style={sh.app}>
      <aside style={sh.sidebar}>
        <div style={sh.logoArea}>
          <div style={sh.logoM}>M<span style={{color:'#5DCAA5'}}>.</span>orpheus</div>
          <div style={sh.logoSub}>morpheuscrm.com</div>
        </div>
        <nav style={sh.nav}>
          <div style={sh.navSec}>Workspace</div>
          {NAV.map(item => {
            const active = item.path==='/' ? location.pathname==='/' : location.pathname.startsWith(item.path)
            return (
              <div key={item.path} style={{...sh.navItem,...(active?sh.navActive:{})}} onClick={() => navigate(item.path)}>
                <span style={{opacity:active?1:0.65}}>{ICONS[item.icon]}</span>{item.label}
              </div>
            )
          })}
        </nav>
        <div style={sh.userArea}>
          <div style={{display:'flex',alignItems:'center',gap:'9px',marginBottom:'8px'}}>
            <div style={sh.avatar}>{initials}</div>
            <div>
              <div style={sh.userName}>{displayName}</div>
              <span style={{...sh.rolePill,...(isAdmin?{background:'rgba(83,74,183,0.3)',color:'#B5B0F5'}:{})}}>{isAdmin?'Admin':'Trainer'}</span>
            </div>
          </div>
          <button style={sh.signOutBtn} onClick={() => signOut().then(() => navigate('/login'))}>Sign out</button>
        </div>
      </aside>

      <main style={sh.main}>
        <div style={sh.topbar}>
          <span style={sh.topbarTitle}>{currentLabel}</span>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            {stats && <span style={sh.statPill}>{stats.totalCalls} calls · {stats.certsIssued} certs issued</span>}
            {!location.pathname.includes('/new') && (
              <button style={sh.newBtn} onClick={() => navigate('/participants/new')}>+ Enroll participant</button>
            )}
          </div>
        </div>

        <div style={sh.content}>
          <Routes>
            <Route path="/" element={<Dashboard stats={stats} cohorts={cohorts} navigate={navigate}/>}/>
            <Route path="/simulator" element={<CallSimulator role="trainer" participants={participants} staffProfileId={staffProfileId}/>}/>
            <Route path="/participants" element={<ParticipantsList participants={participants} navigate={navigate}/>}/>
            <Route path="/participants/new" element={<ParticipantIntake cohorts={cohorts} staffProfiles={[]}/>}/>
            <Route path="/participants/:id" element={<ParticipantProfile/>}/>
            <Route path="/cohorts" element={<CohortManagement cohorts={cohorts}/>}/>
            <Route path="/matrix"  element={<ScoreMatrix/>}/>
            {isAdmin && <Route path="/admin" element={<AdminPanel/>}/>}
          </Routes>
        </div>
      </main>
    </div>
  )
}

function Dashboard({ stats, cohorts, navigate }) {
  if (!stats) return <div style={{padding:'40px',color:'var(--color-text-secondary)'}}>Loading…</div>
  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'12px',marginBottom:'20px'}}>
        {[
          {label:'Active participants', value:stats.activeParts,  sub:`${cohorts.length} cohorts`},
          {label:'Calls logged to DB',  value:stats.totalCalls,   sub:'Morpheus records'},
          {label:'Avg score',           value:stats.avgScore,      sub:'all participants'},
          {label:'Certs issued',        value:stats.certsIssued,   sub:'threshold ≥ 80'},
        ].map((m,i) => (
          <div key={i} style={{background:'var(--color-background-primary)',border:'1px solid #CBD8E6',borderRadius:'12px',padding:'16px'}}>
            <div style={{fontSize:'11px',color:'var(--color-text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'6px'}}>{m.label}</div>
            <div style={{fontSize:'28px',fontWeight:300,color:'var(--color-text-primary)',fontFamily:'monospace',lineHeight:1}}>{m.value??'—'}</div>
            <div style={{fontSize:'11px',color:'var(--color-text-tertiary)',marginTop:'5px'}}>{m.sub}</div>
          </div>
        ))}
      </div>
      <div style={{background:'var(--color-background-primary)',border:'1px solid #CBD8E6',borderRadius:'16px',overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
          <thead><tr style={{background:'var(--color-background-secondary)'}}>
            {['Cohort','Source','Participants','Calls','Avg score','Status'].map(h=>(
              <th key={h} style={{padding:'9px 14px',textAlign:'left',fontWeight:500,fontSize:'11px',color:'var(--color-text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid #CBD8E6'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {cohorts.map((c,i)=>(
              <tr key={c.id} style={{borderBottom:i<cohorts.length-1?'1px solid #F0F4F8':'none'}}>
                <td style={{padding:'10px 14px',fontWeight:500,color:'var(--color-text-primary)'}}>{c.name}</td>
                <td style={{padding:'10px 14px',color:'var(--color-text-secondary)',fontSize:'12px'}}>{c.program_source}</td>
                <td style={{padding:'10px 14px'}}>{c.participant_count??0}</td>
                <td style={{padding:'10px 14px'}}>{c.total_calls??0}</td>
                <td style={{padding:'10px 14px',fontWeight:600,color:c.cohort_avg_score?scoreColor(c.cohort_avg_score):'var(--color-text-tertiary)',fontFamily:'monospace'}}>{c.cohort_avg_score??'—'}</td>
                <td style={{padding:'10px 14px'}}>
                  <span style={{fontSize:'10px',fontWeight:600,padding:'2px 9px',borderRadius:'20px',background:c.status==='Active'?'#E1F5EE':'#E6F1FB',color:c.status==='Active'?'#0F6E56':'#0C447C'}}>{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ParticipantsList({ participants, navigate }) {
  const [q, setQ] = useState('')
  const list = q ? participants.filter(p=>p.full_name?.toLowerCase().includes(q.toLowerCase())||p.cts_id?.includes(q)) : participants
  return (
    <div>
      <div style={{display:'flex',gap:'10px',marginBottom:'14px',alignItems:'center'}}>
        <input style={{padding:'7px 11px',border:'1px solid #CBD8E6',borderRadius:'8px',fontSize:'13px',fontFamily:"'DM Sans',sans-serif",width:'220px'}}
          placeholder="Search name or CTS ID…" value={q} onChange={e=>setQ(e.target.value)}/>
        <div style={{flex:1}}/>
        <button style={{padding:'8px 16px',background:'#0D1B2A',color:'#fff',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:500,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}
          onClick={()=>navigate('/participants/new')}>+ Enroll participant</button>
      </div>
      <div style={{background:'var(--color-background-primary)',border:'1px solid #CBD8E6',borderRadius:'16px',overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
          <thead><tr style={{background:'var(--color-background-secondary)'}}>
            {['CTS ID','Name','Source','Calls','Avg','Best','Certified'].map(h=>(
              <th key={h} style={{padding:'9px 14px',textAlign:'left',fontWeight:500,fontSize:'11px',color:'var(--color-text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid #CBD8E6'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {list.map((p,i)=>(
              <tr key={p.participant_id} style={{borderBottom:i<list.length-1?'1px solid #F0F4F8':'none',cursor:'pointer'}}
                onClick={()=>navigate(`/participants/${p.participant_id}`)}>
                <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:'11px',color:'var(--color-text-tertiary)'}}>{p.cts_id}</td>
                <td style={{padding:'10px 14px',fontWeight:500,color:'var(--color-text-primary)'}}>{p.full_name}</td>
                <td style={{padding:'10px 14px',color:'var(--color-text-secondary)',fontSize:'12px'}}>{p.program_source}</td>
                <td style={{padding:'10px 14px'}}>{p.total_calls??0}</td>
                <td style={{padding:'10px 14px',fontWeight:600,color:p.avg_score?scoreColor(p.avg_score):'var(--color-text-tertiary)',fontFamily:'monospace'}}>{p.avg_score??'—'}</td>
                <td style={{padding:'10px 14px',fontFamily:'monospace',color:'var(--color-text-secondary)'}}>{p.best_score??'—'}</td>
                <td style={{padding:'10px 14px'}}>
                  {p.is_certified
                    ? <span style={{fontSize:'10px',fontWeight:600,padding:'2px 9px',borderRadius:'20px',background:'#E1F5EE',color:'#0F6E56'}}>Certified ✓</span>
                    : <span style={{fontSize:'10px',color:'var(--color-text-tertiary)'}}>In training</span>}
                </td>
              </tr>
            ))}
            {list.length===0&&<tr><td colSpan={7} style={{padding:'24px',textAlign:'center',color:'var(--color-text-tertiary)',fontStyle:'italic'}}>No participants found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const sh = {
  app:{display:'flex',height:'100vh',overflow:'hidden',fontFamily:"'DM Sans',sans-serif"},
  sidebar:{width:'224px',minWidth:'224px',background:'#0D1B2A',display:'flex',flexDirection:'column'},
  logoArea:{padding:'20px 18px 14px',borderBottom:'1px solid rgba(255,255,255,0.08)'},
  logoM:{fontFamily:'monospace',fontSize:'22px',fontWeight:500,color:'#fff',letterSpacing:'-0.5px'},
  logoSub:{fontSize:'10px',color:'rgba(255,255,255,0.3)',letterSpacing:'0.07em',marginTop:'2px'},
  nav:{padding:'12px 10px',flex:1,overflowY:'auto'},
  navSec:{fontSize:'10px',color:'rgba(255,255,255,0.3)',letterSpacing:'0.1em',textTransform:'uppercase',padding:'10px 8px 6px'},
  navItem:{display:'flex',alignItems:'center',gap:'9px',padding:'9px 10px',borderRadius:'8px',cursor:'pointer',fontSize:'13px',color:'rgba(255,255,255,0.55)',marginBottom:'1px',transition:'all 0.12s'},
  navActive:{background:'rgba(33,118,174,0.25)',color:'#fff',fontWeight:500},
  userArea:{padding:'12px',borderTop:'1px solid rgba(255,255,255,0.08)'},
  avatar:{width:'30px',height:'30px',borderRadius:'50%',background:'#2176AE',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:600,flexShrink:0},
  userName:{fontSize:'12px',fontWeight:500,color:'rgba(255,255,255,0.75)',marginBottom:'2px'},
  rolePill:{fontSize:'9px',padding:'2px 7px',borderRadius:'10px',background:'rgba(33,118,174,0.3)',color:'#7EC8F0',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'},
  signOutBtn:{background:'none',border:'1px solid rgba(255,255,255,0.12)',borderRadius:'6px',color:'rgba(255,255,255,0.4)',fontSize:'11px',cursor:'pointer',padding:'5px 10px',fontFamily:"'DM Sans',sans-serif",marginTop:'8px'},
  main:{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:'#F7F9FC'},
  topbar:{background:'#fff',borderBottom:'1px solid #CBD8E6',padding:'0 24px',height:'54px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0},
  topbarTitle:{fontSize:'15px',fontWeight:500,color:'#0D1B2A'},
  statPill:{fontSize:'11px',color:'var(--color-text-secondary)',background:'var(--color-background-secondary)',padding:'4px 10px',borderRadius:'20px'},
  newBtn:{padding:'7px 14px',background:'#0D1B2A',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:500,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"},
  content:{flex:1,overflowY:'auto',padding:'22px'},
}
