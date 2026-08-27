// src/pages/TrainerShell.jsx  v2  (Sprint 3)
import { useState, useEffect, useRef } from 'react'
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom'
import { signOut } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { getDashboardStats, getCohortOverview, getParticipantPerformance } from '../lib/db.js'
import { getCurrentTenants, getEnabledModules } from '../lib/platform.js'
import ParticipantIntake   from './ParticipantIntake.jsx'
import ParticipantProfile  from './ParticipantProfile.jsx'
import CohortManagement    from './CohortManagement.jsx'
import CallSimulator       from './CallSimulator.jsx'
import ScoreMatrix         from './ScoreMatrix.jsx'
import AdminPanel          from './AdminPanel.jsx'
import AcademyAdmin        from './AcademyAdmin.jsx'

const NAV_BASE = [
  { path:'/',             label:'Dashboard',        icon:'grid'    },
  { path:'/simulator',   label:'AI Call Simulator', icon:'monitor' },
  { path:'/academy',     label:'Claude Academy',    icon:'book'    },
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
  book:    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 3.5A1.5 1.5 0 013.5 2H8v12H3.5A1.5 1.5 0 012 12.5v-9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M14 3.5A1.5 1.5 0 0012.5 2H8v12h4.5a1.5 1.5 0 001.5-1.5v-9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  box:     <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l5.5 3v7L8 14.5l-5.5-3v-7l5.5-3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M2.5 4.5L8 7.5l5.5-3M8 7.5v7" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  heart:   <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 13.5S2 10 2 6.2A3.2 3.2 0 018 4.4a3.2 3.2 0 016 1.8C14 10 8 13.5 8 13.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  chevron: <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
}

// ── MorpheusOS service registry → application routes ───────────
// `workforce.cer` IS this application: it owns the Morpheus CRM
// screens at the root. `workforce.academy` owns the existing
// MORPHEUS.EDU screens at /academy. Every other registered module is
// real data in the platform with no interface built yet, so it routes
// to an honest placeholder at /m/<module key>.
const MODULE_ROUTES = {
  'workforce.cer':     '/',
  'workforce.academy': '/academy',
}
const MODULE_ICONS = {
  'workforce.cer':     'grid',
  'workforce.academy': 'book',
}
const CATEGORY_ICONS = {
  workforce: 'monitor',
  crm:       'users',
  logistics: 'box',
  quality:   'chart',
  nonprofit: 'heart',
}
const CER_MODULE_KEY = 'workforce.cer'

/** Route a module opens at. Unbuilt modules get the placeholder route. */
function moduleRoute(mod) {
  return MODULE_ROUTES[mod.key] ?? `/m/${mod.key}`
}
function moduleIcon(mod) {
  return MODULE_ICONS[mod.key] ?? CATEGORY_ICONS[mod.category] ?? 'grid'
}
/**
 * Which module the current path belongs to. Modules with their own
 * route win; anything else inside the CRM belongs to CER.
 */
function activeModuleKey(modules, pathname) {
  const owned = modules.find(m => {
    const r = moduleRoute(m)
    return r !== '/' && (pathname === r || pathname.startsWith(r + '/'))
  })
  if (owned) return owned.key
  return modules.some(m => m.key === CER_MODULE_KEY) ? CER_MODULE_KEY : null
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

  // ── MorpheusOS service registry ──────────────────────────────
  const [tenants, setTenants]           = useState([])
  const [activeTenantId, setActiveTenantId] = useState(null)
  const [modules, setModules]           = useState([])
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false)
  const pendingTenantJump = useRef(false)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    getCurrentTenants()
      .then(list => {
        if (cancelled) return
        setTenants(list)
        setActiveTenantId(prev => prev ?? list[0]?.id ?? null)
      })
      // Registry unreachable → sidebar falls back to the built-in nav.
      .catch(() => { if (!cancelled) setTenants([]) })
    return () => { cancelled = true }
  }, [user?.id])

  useEffect(() => {
    if (!activeTenantId) { setModules([]); return }
    let cancelled = false
    getEnabledModules(activeTenantId)
      .then(list => {
        if (cancelled) return
        setModules(list)
        // After a tenant switch, land on that tenant's first service —
        // the previous tenant's module may not be enabled here.
        if (pendingTenantJump.current) {
          pendingTenantJump.current = false
          const first = list.find(m => m.status !== 'PLANNED') ?? list[0]
          if (first) navigate(moduleRoute(first))
        }
      })
      .catch(() => { if (!cancelled) setModules([]) })
    return () => { cancelled = true }
  }, [activeTenantId, navigate])

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

  // The registry drives the sidebar only when it actually returned
  // something. No membership rows, or a failed read, keeps today's nav.
  const registryActive = modules.length > 0
  const activeTenant   = tenants.find(t => t.id === activeTenantId) ?? null
  const activeKey      = registryActive ? activeModuleKey(modules, location.pathname) : null
  const cerEnabled     = modules.some(m => m.key === CER_MODULE_KEY)
  // Modules that own their own route are entered from the switcher, so
  // they are not repeated in the CER workspace list below it.
  const switcherRoutes = registryActive
    ? new Set(modules.filter(m => m.key !== CER_MODULE_KEY).map(moduleRoute))
    : new Set()
  const workspaceNav = NAV.filter(n => !switcherRoutes.has(n.path))
  const showWorkspace = !registryActive || (cerEnabled && activeKey === CER_MODULE_KEY)

  const currentLabel =
    workspaceNav.find(n => n.path==='/' ? location.pathname==='/' : location.pathname.startsWith(n.path))?.label
    ?? modules.find(m => m.key === activeKey)?.name
    ?? 'Morpheus'

  function switchTenant(tenantId) {
    setTenantMenuOpen(false)
    if (tenantId === activeTenantId) return
    pendingTenantJump.current = true
    setActiveTenantId(tenantId)
  }

  return (
    <div style={sh.app}>
      <aside style={sh.sidebar}>
        <div style={sh.logoArea}>
          <div style={sh.logoM}>M<span style={{color:'#5DCAA5'}}>.</span>orpheus</div>
          <div style={sh.logoSub}>morpheuscr.com</div>
        </div>
        <nav style={sh.nav}>
          {registryActive && (
            <>
              <div style={sh.navSec}>Services</div>

              {tenants.length > 1 && (
                <>
                  <div style={sh.tenantBtn} onClick={() => setTenantMenuOpen(o => !o)}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={sh.tenantName}>{activeTenant?.name ?? 'Select organisation'}</div>
                      {activeTenant?.status && activeTenant.status !== 'ACTIVE' && (
                        <div style={sh.tenantStatus}>{activeTenant.status.toLowerCase()}</div>
                      )}
                    </div>
                    <span style={{opacity:0.5,transform:tenantMenuOpen?'rotate(180deg)':'none',display:'flex'}}>{ICONS.chevron}</span>
                  </div>
                  {tenantMenuOpen && tenants.map(t => (
                    <div key={t.id}
                      style={{...sh.tenantOption,...(t.id===activeTenantId?sh.navActive:{})}}
                      onClick={() => switchTenant(t.id)}>
                      {t.name}
                    </div>
                  ))}
                </>
              )}

              {modules.map(mod => {
                const planned = mod.status === 'PLANNED'
                const active  = mod.key === activeKey
                if (planned) {
                  return (
                    <div key={mod.key} style={{...sh.navItem,...sh.navItemDisabled}} title={`${mod.name} — not yet available`}>
                      <span style={{opacity:0.4}}>{ICONS[moduleIcon(mod)]}</span>
                      <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{mod.name}</span>
                      <span style={sh.soonPill}>Coming soon</span>
                    </div>
                  )
                }
                return (
                  <div key={mod.key}
                    style={{...sh.navItem,...(active?sh.navActive:{})}}
                    onClick={() => navigate(moduleRoute(mod))}>
                    <span style={{opacity:active?1:0.65}}>{ICONS[moduleIcon(mod)]}</span>
                    <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{mod.name}</span>
                  </div>
                )
              })}
            </>
          )}

          {showWorkspace && <>
            <div style={sh.navSec}>Workspace</div>
            {workspaceNav.map(item => {
              const active = item.path==='/' ? location.pathname==='/' : location.pathname.startsWith(item.path)
              return (
                <div key={item.path} style={{...sh.navItem,...(active?sh.navActive:{})}} onClick={() => navigate(item.path)}>
                  <span style={{opacity:active?1:0.65}}>{ICONS[item.icon]}</span>{item.label}
                </div>
              )
            })}
          </>}
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
            {/* CER figures and CER actions belong to the CER module only. */}
            {showWorkspace && stats && <span style={sh.statPill}>{stats.totalCalls} calls · {stats.certsIssued} certs issued</span>}
            {showWorkspace && !location.pathname.includes('/new') && (
              <button style={sh.newBtn} onClick={() => navigate('/participants/new')}>+ Enroll participant</button>
            )}
          </div>
        </div>

        <div style={sh.content}>
          <Routes>
            <Route path="/" element={<Dashboard stats={stats} cohorts={cohorts} navigate={navigate}/>}/>
            <Route path="/simulator" element={<CallSimulator role="trainer" participants={participants} staffProfileId={staffProfileId}/>}/>
            <Route path="/academy/*" element={<AcademyAdmin staffProfileId={staffProfileId}/>}/>
            <Route path="/participants" element={<ParticipantsList participants={participants} navigate={navigate}/>}/>
            <Route path="/participants/new" element={<ParticipantIntake cohorts={cohorts} staffProfiles={[]}/>}/>
            <Route path="/participants/:id" element={<ParticipantProfile/>}/>
            <Route path="/cohorts" element={<CohortManagement cohorts={cohorts}/>}/>
            <Route path="/matrix"  element={<ScoreMatrix/>}/>
            <Route path="/m/:moduleKey" element={<ModulePlaceholder modules={modules} tenant={activeTenant}/>}/>
            {isAdmin && <Route path="/admin" element={<AdminPanel/>}/>}
          </Routes>
        </div>
      </main>
    </div>
  )
}

/**
 * A module that is registered and enabled but has no interface yet.
 * Everything shown here comes from core.module — no invented metrics,
 * no placeholder dashboard.
 */
function ModulePlaceholder({ modules, tenant }) {
  const { moduleKey } = useParams()
  const mod = modules.find(m => m.key === moduleKey)

  if (!mod) {
    return (
      <div style={sh.ph.card}>
        <div style={sh.ph.title}>Service not available</div>
        <p style={sh.ph.body}>
          <code style={sh.ph.code}>{moduleKey}</code> is not a service enabled for
          {tenant ? ` ${tenant.name}` : ' this organisation'}, or it is not registered
          on the platform. Pick a service from the sidebar.
        </p>
      </div>
    )
  }

  return (
    <div style={sh.ph.card}>
      <div style={sh.ph.eyebrow}>{mod.category} · {mod.status.toLowerCase()}</div>
      <div style={sh.ph.title}>{mod.name}</div>
      {mod.description && <p style={sh.ph.body}>{mod.description}</p>}
      <div style={sh.ph.divider}/>
      <p style={sh.ph.body}>
        This service is registered in the MorpheusOS platform registry and enabled for
        {tenant ? ` ${tenant.name}` : ' your organisation'}, but its interface has not been
        built yet. There is nothing to show here — no screens exist for it, so none are
        being simulated.
      </p>
      <div style={sh.ph.metaRow}>
        <div><span style={sh.ph.metaLabel}>Module key</span><code style={sh.ph.code}>{mod.key}</code></div>
        <div><span style={sh.ph.metaLabel}>Data schema</span><code style={sh.ph.code}>{mod.schema_name}</code></div>
      </div>
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
  navItemDisabled:{cursor:'default',color:'rgba(255,255,255,0.28)'},
  soonPill:{fontSize:'9px',padding:'2px 6px',borderRadius:'10px',background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.35)',fontWeight:600,letterSpacing:'0.04em',whiteSpace:'nowrap',flexShrink:0},
  tenantBtn:{display:'flex',alignItems:'center',gap:'8px',padding:'8px 10px',borderRadius:'8px',cursor:'pointer',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',marginBottom:'6px'},
  tenantName:{fontSize:'12px',fontWeight:500,color:'rgba(255,255,255,0.8)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  tenantStatus:{fontSize:'9px',color:'#5DCAA5',letterSpacing:'0.06em',textTransform:'uppercase',marginTop:'2px'},
  tenantOption:{padding:'7px 10px 7px 18px',borderRadius:'8px',cursor:'pointer',fontSize:'12px',color:'rgba(255,255,255,0.55)',marginBottom:'1px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
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
  ph:{
    card:{background:'var(--color-background-primary)',border:'1px solid #CBD8E6',borderRadius:'16px',padding:'28px',maxWidth:'620px'},
    eyebrow:{fontSize:'11px',color:'var(--color-text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'8px'},
    title:{fontSize:'22px',fontWeight:500,color:'#0D1B2A',marginBottom:'10px'},
    body:{fontSize:'13px',lineHeight:1.6,color:'var(--color-text-secondary)',margin:'0 0 4px'},
    divider:{height:'1px',background:'#F0F4F8',margin:'18px 0'},
    metaRow:{display:'flex',gap:'26px',marginTop:'18px',flexWrap:'wrap'},
    metaLabel:{display:'block',fontSize:'10px',color:'var(--color-text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'4px'},
    code:{fontFamily:'monospace',fontSize:'12px',color:'var(--color-text-primary)',background:'var(--color-background-secondary)',padding:'2px 6px',borderRadius:'5px'},
  },
}
