import { useEffect, useMemo, useState } from 'react'
import { fromModuleSchema } from '../../lib/morpheus.js'
import { supabase } from '../../lib/supabase.js'
import { ModuleHeader, Pill, Table, styles } from '../common/ModuleFrame.jsx'
import { programFor } from './programs.js'
import { analyzeDispatchQueue } from './dispatchIntelligence.js'

const SCHEMA = 'melrah'

function tone(status) {
  const s = String(status ?? '').toUpperCase()
  if (['COMPLETED','CLOSED'].includes(s)) return 'good'
  if (['URGENT','EXCEPTION','CANCELLED'].includes(s)) return 'bad'
  if (['DISPATCHED','EN_ROUTE','ARRIVED','IN_PROGRESS','HIGH'].includes(s)) return 'warn'
  return 'info'
}

export default function MelrahDispatch() {
  const [queue, setQueue] = useState({ loading: true, data: [] })
  const [resources, setResources] = useState({ loading: true, data: [] })
  const [notice,setNotice]=useState('')
  async function assign(workOrderId,resourceId){
    if(!resourceId) return { error: 'Choose a collector first.' }
    const {error}=await supabase.rpc('melrah_dispatch_assign',{p_work_order_id:workOrderId,p_resource_id:resourceId})
    if(error){ setNotice(`Could not save: ${error.message}`); return { error: error.message } }
    setNotice('Saved. The work order is dispatched and will appear in the collector\'s Route Briefcase.')
    setQueue(q=>({...q,data:q.data.map(x=>x.id===workOrderId?{...x,assigned_resource_id:resourceId,status:'RELEASED'}:x)}))
    return { error: null }
  }

  useEffect(() => {
    supabase.from('ml_dispatch_recommendations').select('*').order('route_score', { ascending: false }).order('scheduled_for', { ascending: true }).limit(200)
      .then(r => setQueue({ loading: false, data: r.data ?? [], error: r.error }))
    fromModuleSchema(SCHEMA, 'field_resource', q => q.eq('active', true).order('display_name'))
      .then(r => setResources({ loading: false, data: r.data ?? [], error: r.error }))
  }, [])

  const drivers = resources.data.filter(r => r.role === 'DRIVER')
  const advisory = useMemo(() => analyzeDispatchQueue(queue.data), [queue.data])
  const flagged = advisory.filter(item => item.flags.length > 0)

  const stats = useMemo(() => ({
    unassigned: queue.data.filter(x => !x.assigned_resource_id).length,
    urgent: queue.data.filter(x => x.priority === 'URGENT' || Number(x.max_fill_pct) >= 90).length,
    drivers: resources.data.filter(r => r.role === 'DRIVER').length,
  }), [queue.data, resources.data])

  return (
    <div>
      <ModuleHeader
        title="Melrah Operations Control"
        subtitle="Dispatch work orders, monitor routes, and prioritize collection capacity"
        right={<div style={{display:'flex',gap:8}}>
          <Pill tone="warn">{stats.unassigned} unassigned</Pill>
          <Pill tone="bad">{stats.urgent} urgent</Pill>
          <Pill tone="info">{stats.drivers} drivers</Pill>
        </div>}
      />

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:12,marginBottom:20}}>
        <Metric label="Open queue" value={queue.data.length} sub="active collection work orders" />
        <Metric label="Capacity alerts" value={queue.data.filter(x => Number(x.max_fill_pct)>=80).length} sub="80%+ reported or predicted" />
        <Metric label="Active field resources" value={resources.data.length} sub="drivers / dispatch / ops" />
      </div>

      <section aria-label="Dispatch intelligence recommendations" style={{marginBottom:20,padding:16,border:'1px solid #CBD8E6',borderRadius:12,background:'var(--color-background-primary)'}}>
        <h3 style={{margin:'0 0 6px'}}>Dispatch intelligence <Pill tone="info">Advisory only</Pill></h3>
        <p style={{fontSize:13,color:'var(--color-text-secondary)',margin:'0 0 12px'}}>Rules-based review of the current work queue. No automatic route or assignment changes.</p>
        {queue.loading ? <p>Analyzing work orders…</p> : queue.error ? <p role="alert">Recommendations unavailable: {queue.error.message}</p> : flagged.length === 0 ? <p>No dispatch exceptions detected in the loaded queue.</p> :
          <div style={{display:'grid',gap:8}}>
            {flagged.slice(0,10).map(item => {
              const order = queue.data.find(o => String(o.id) === item.workOrderId)
              return <div key={item.workOrderId} style={{borderTop:'1px solid #CBD8E6',paddingTop:8}}>
                <strong>{order?.wo_number ?? item.workOrderId}</strong>{' · '}<Pill tone={item.severity === 'high' ? 'bad' : 'warn'}>{item.severity}</Pill>{' · '}<span>{programFor(order).shortLabel}</span>
                <div style={{fontSize:13,marginTop:4}}>{item.recommendation}</div>
                <div style={{fontSize:12,color:'var(--color-text-secondary)'}}>{item.flags.join(' · ')}</div>
              </div>
            })}
            {flagged.length > 10 && <p style={{fontSize:12}}>Showing 10 of {flagged.length} flagged work orders.</p>}
          </div>}
      </section>
      {notice&&<div style={{marginBottom:12,padding:10,borderRadius:8,background:'#E8EFF6'}}>{notice}</div>}
      <div className='dispatch-table' style={{overflowX:'auto'}}>
        <Table
          columns={['Program','WO #','Location','City','Priority','Status','Scheduled','Fill','Score','Assignment']}
          rows={queue.data}
          keyOf={o => o.id}
          renderRow={o => (
            <>
              <td style={styles.td}><Pill tone={o.program_key==='ORGANICS_COFFEE'?'good':'info'}>{programFor(o).shortLabel}</Pill></td><td style={{...styles.td,fontFamily:'monospace',fontWeight:600}}>{o.wo_number}</td>
              <td style={styles.td}>{o.location_name ?? '—'}</td>
              <td style={{...styles.td,color:'#5B6B7F'}}>{o.city ?? '—'}</td>
              <td style={styles.td}><Pill tone={tone(o.priority)}>{o.priority ?? 'NORMAL'}</Pill></td>
              <td style={styles.td}><Pill tone={tone(o.status)}>{o.status ?? 'OPEN'}</Pill></td>
              <td style={styles.td}>{o.scheduled_for ?? '—'}</td>
              <td style={styles.td}><Pill tone={Number(o.max_fill_pct)>=90?'bad':Number(o.max_fill_pct)>=80?'warn':'neutral'}>{Number(o.max_fill_pct||0).toFixed(0)}%</Pill></td><td style={styles.td}><strong>{o.route_score??'—'}</strong></td>
              <td style={styles.td}><AssignmentSelect order={o} drivers={drivers} assign={assign}/></td>
            </>
          )}
        />
      </div>
      <div className='dispatch-mobile-cards'>
        {queue.data.map(o=><div className='dispatch-mobile-card' key={o.id}>
          <div className='dispatch-mobile-head'><Pill tone={o.program_key==='ORGANICS_COFFEE'?'good':'info'}>{programFor(o).shortLabel}</Pill><strong>{o.wo_number}</strong></div>
          <div className='dispatch-mobile-place'>{o.location_name ?? 'No location'}{o.city ? ` · ${o.city}` : ''}</div>
          <div className='dispatch-mobile-meta'><Pill tone={tone(o.status)}>{o.status ?? 'OPEN'}</Pill><span>{Number(o.max_fill_pct||0).toFixed(0)}% fill</span></div>
          <label className='dispatch-mobile-label'>Assign collector<AssignmentSelect order={o} drivers={drivers} assign={assign}/></label>
        </div>)}
      </div>
      <style>{`.dispatch-mobile-cards{display:none}@media(max-width:720px){.dispatch-table{display:none!important}.dispatch-mobile-cards{display:grid;gap:12px}.dispatch-mobile-card{background:var(--color-background-primary);border:1px solid #CBD8E6;border-radius:14px;padding:14px;min-width:0}.dispatch-mobile-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.dispatch-mobile-head strong{font-family:monospace;font-size:16px}.dispatch-mobile-place{margin:10px 0;color:#42546A;font-size:14px}.dispatch-mobile-meta{display:flex;align-items:center;gap:8px;margin-bottom:12px;color:#5B6B7F;font-size:12px}.dispatch-mobile-label{display:grid;gap:6px;color:#42546A;font-size:12px;font-weight:700}.dispatch-mobile-label select{width:100%;min-height:46px;border:1px solid #AFC0D2;border-radius:10px;background:white;padding:0 10px;font-size:16px}}`}</style>
    </div>
  )
}

function AssignmentSelect({order,drivers,assign}) {
  const saved = order.assigned_resource_id || ''
  const [choice,setChoice] = useState(saved)
  const [state,setState] = useState({ saving:false, msg:'', error:false })
  useEffect(()=>{ setChoice(saved) },[saved])
  const dirty = choice !== saved
  async function save(){
    setState({ saving:true, msg:'', error:false })
    const { error } = await assign(order.id, choice)
    setState(error ? { saving:false, msg:error, error:true } : { saving:false, msg:'Saved', error:false })
  }
  return <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:6}}>
    <select aria-label={`Assign collector for ${order.wo_number}`} value={choice}
      onChange={e=>{ setChoice(e.target.value); setState({saving:false,msg:'',error:false}) }}>
      <option value=''>Unassigned</option>
      {drivers.map(r=><option key={r.id} value={r.id}>{r.display_name}</option>)}
    </select>
    <button type='button' onClick={save} disabled={!dirty || !choice || state.saving}
      aria-label={`Save assignment for ${order.wo_number}`}
      style={{padding:'6px 12px',borderRadius:8,border:'none',fontWeight:600,cursor:(!dirty||!choice||state.saving)?'not-allowed':'pointer',
        background:(!dirty||!choice)?'#CBD8E6':'#0D1B2A',color:(!dirty||!choice)?'#5B6B7F':'#fff'}}>
      {state.saving ? 'Saving…' : 'Save'}
    </button>
    {state.msg && <span role='status' style={{fontSize:12,fontWeight:600,color:state.error?'#B42318':'#0F6E56'}}>{state.error ? state.msg : '✓ Saved'}</span>}
  </div>
}

function Metric({label,value,sub}) {
  return <div style={{background:'var(--color-background-primary)',border:'1px solid #CBD8E6',borderRadius:12,padding:16}}>
    <div style={{fontSize:11,color:'var(--color-text-tertiary)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>{label}</div>
    <div style={{fontSize:28,fontWeight:300,fontFamily:'monospace'}}>{value}</div>
    <div style={{fontSize:11,color:'var(--color-text-tertiary)',marginTop:5}}>{sub}</div>
  </div>
}
