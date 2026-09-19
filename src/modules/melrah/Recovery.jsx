import { useEffect, useMemo, useState } from 'react'
import { fromModuleSchema } from '../../lib/morpheus.js'
import { ModuleHeader, Pill, Table, styles } from '../common/ModuleFrame.jsx'

const SCHEMA='melrah'

export default function MelrahRecovery(){
  const [records,setRecords]=useState([])
  const [batches,setBatches]=useState([])

  useEffect(()=>{
    fromModuleSchema(SCHEMA,'collection_record',q=>q.order('recorded_at',{ascending:false}).limit(500)).then(r=>setRecords(r.data??[]))
    fromModuleSchema(SCHEMA,'material_batch',q=>q.order('created_at',{ascending:false}).limit(200)).then(r=>setBatches(r.data??[]))
  },[])

  const stats=useMemo(()=>{
    const lbs=records.reduce((n,r)=>n+Number(r.weight_lbs||0),0)
    const count=records.reduce((n,r)=>n+Number(r.package_count||0),0)
    const pouch=records.filter(r=>r.material_stream==='FLEXIBLE_POUCH').reduce((n,r)=>n+Number(r.weight_lbs||0),0)
    const avgCont=records.length?records.reduce((n,r)=>n+Number(r.contamination_pct||0),0)/records.length:0
    return {lbs,count,pouch,avgCont}
  },[records])

  return <div>
    <ModuleHeader title="Recovery Intelligence" subtitle="Measured recovery, contamination and downstream disposition" right={<Pill tone="info">{records.length} collection records</Pill>} />
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:12,marginBottom:20}}>
      <Metric label="Recovered weight" value={`${stats.lbs.toFixed(1)} lb`} />
      <Metric label="Packages counted" value={stats.count.toLocaleString()} />
      <Metric label="Flexible pouch weight" value={`${stats.pouch.toFixed(1)} lb`} />
      <Metric label="Avg contamination" value={`${stats.avgCont.toFixed(1)}%`} />
    </div>
    <div style={{overflowX:'auto'}}><Table
      columns={['Batch','Stream','Status','Weight','Processor','Final disposition']}
      rows={batches}
      keyOf={b=>b.id}
      renderRow={b=><>
        <td style={{...styles.td,fontFamily:'monospace',fontWeight:600}}>{b.batch_code}</td>
        <td style={styles.td}>{String(b.material_stream||'').replaceAll('_',' ')}</td>
        <td style={styles.td}><Pill tone={b.status==='FINAL_DISPOSITION'?'good':'info'}>{b.status}</Pill></td>
        <td style={styles.td}>{b.received_weight_lbs??'—'}</td>
        <td style={styles.td}>{b.processor_name??'—'}</td>
        <td style={styles.td}>{b.final_disposition??'Pending'}</td>
      </>}
    /></div>
  </div>
}

function Metric({label,value}){return <div style={{background:'var(--color-background-primary)',border:'1px solid #CBD8E6',borderRadius:12,padding:16}}><div style={{fontSize:11,color:'var(--color-text-tertiary)',textTransform:'uppercase',letterSpacing:'.06em'}}>{label}</div><div style={{fontSize:26,fontFamily:'monospace',marginTop:7}}>{value}</div></div>}
