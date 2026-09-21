import { useEffect, useMemo, useState } from 'react'
import { fromModuleSchema } from '../../lib/morpheus.js'
import { supabase } from '../../lib/supabase.js'
import { ModuleHeader, Pill, Table, styles } from '../common/ModuleFrame.jsx'
import { programFor } from './programs.js'

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
  async function assign(workOrderId,resourceId){if(!resourceId)return;const {error}=await supabase.rpc('melrah_dispatch_assign',{p_work_order_id:workOrderId,p_resource_id:resourceId});setNotice(error?error.message:'Dispatched to collector. It will appear in their Route Briefcase.');if(!error)setQueue(q=>({...q,data:q.data.map(x=>x.id===workOrderId?{...x,assigned_resource_id:resourceId,status:'RELEASED'}:x)}))}

  useEffect(() => {
    supabase.from('ml_dispatch_recommendations').select('*').order('route_score', { ascending: false }).order('scheduled_for', { ascending: true }).limit(200)
      .then(r => setQueue({ loading: false, data: r.data ?? [], error: r.error }))
    fromModuleSchema(SCHEMA, 'field_resource', q => q.eq('active', true).order('display_name'))
      .then(r => setResources({ loading: false, data: r.data ?? [], error: r.error }))
  }, [])

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
    </div>
  )
}

function AssignmentSelect({order,drivers,assign}) { return <select aria-label={`Assign collector for ${order.wo_number}`} value={order.assigned_resource_id||''} onChange={e=>assign(order.id,e.target.value)}><option value=''>Unassigned</option>{drivers.map(r=><option key={r.id} value={r.id}>{r.display_name}</option>)}</select> }

function Metric({label,value,sub}) {
  return <div style={{background:'var(--color-background-primary)',border:'1px solid #CBD8E6',borderRadius:12,padding:16}}>
    <div style={{fontSize:11,color:'var(--color-text-tertiary)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>{label}</div>
    <div style={{fontSize:28,fontWeight:300,fontFamily:'monospace'}}>{value}</div>
    <div style={{fontSize:11,color:'var(--color-text-tertiary)',marginTop:5}}>{sub}</div>
  </div>
}
