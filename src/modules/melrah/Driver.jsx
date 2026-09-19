import { useEffect, useState } from 'react'
import { fromModuleSchema } from '../../lib/morpheus.js'
import { ModuleHeader, Pill, styles } from '../common/ModuleFrame.jsx'

const SCHEMA = 'melrah'
const STEPS = ['DISPATCHED','ACCEPTED','EN_ROUTE','ARRIVED','IN_PROGRESS','COMPLETED']

export default function MelrahDriver() {
  const [appointments, setAppointments] = useState([])
  const [active, setActive] = useState(null)

  useEffect(() => {
    fromModuleSchema(SCHEMA, 'service_appointment', q => q.order('scheduled_start', { ascending: true }).limit(50))
      .then(r => {
        const rows = r.data ?? []
        setAppointments(rows)
        setActive(rows.find(a => !['COMPLETED','CANCELLED'].includes(a.status)) ?? rows[0] ?? null)
      })
  }, [])

  const idx = active ? STEPS.indexOf(active.status) : -1

  return (
    <div style={{maxWidth:760,margin:'0 auto'}}>
      <ModuleHeader title="MELRAH FIELD™" subtitle="Today's route · mobile collection workflow" right={<Pill tone="info">{appointments.length} stops</Pill>} />
      {!active ? <Empty /> : <>
        <div style={card}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}>
            <div>
              <div style={eyebrow}>SERVICE APPOINTMENT</div>
              <div style={{fontSize:24,fontWeight:700}}>{active.route_name ?? 'Collection Route'}</div>
              <div style={{color:'#5B6B7F',marginTop:4}}>{active.scheduled_start ? new Date(active.scheduled_start).toLocaleString() : 'Unscheduled'}</div>
            </div>
            <Pill tone={active.status==='COMPLETED'?'good':'warn'}>{active.status}</Pill>
          </div>
        </div>

        <div style={{...card,marginTop:14}}>
          <div style={eyebrow}>WORKFLOW</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:6,marginTop:10}}>
            {STEPS.map((s,i)=><div key={s} style={{padding:'10px 6px',borderRadius:10,textAlign:'center',fontSize:10,fontWeight:700,background:i<=idx?'#DDF5EA':'#F2F5F8',color:i<=idx?'#0F6E56':'#6B7785'}}>{s.replace('_',' ')}</div>)}
          </div>
        </div>

        <div style={{...card,marginTop:14}}>
          <div style={eyebrow}>COLLECTION CHECKLIST</div>
          {['Scan station/container QR','Capture before photo','Record fill level','Record weight and/or package count','Record contamination','Seal/label collected batch','Capture after photo','Complete custody event'].map((x,i)=><div key={x} style={{display:'flex',gap:10,padding:'10px 0',borderBottom:i===7?'none':'1px solid #E4EAF0'}}><span aria-hidden="true">□</span><span>{x}</span></div>)}
        </div>

        <div style={{...card,marginTop:14}}>
          <div style={eyebrow}>MATERIAL STREAMS</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10,marginTop:10}}>
            {[
              ['Flexible Pouches','Primary stream'],['Rigid Plastic','Jars · tubes · containers'],['Glass + Metal','Jars · tins · lids'],['Paper + Fiber','Boxes · cartons · paperboard']
            ].map(([a,b])=><div key={a} style={{border:'1px solid #D7E0E8',borderRadius:12,padding:14}}><div style={{fontWeight:700}}>{a}</div><div style={{fontSize:12,color:'#6B7785',marginTop:3}}>{b}</div></div>)}
          </div>
        </div>
      </>}
    </div>
  )
}

function Empty(){return <div style={card}>No appointments are currently assigned.</div>}
const card={background:'var(--color-background-primary)',border:'1px solid #CBD8E6',borderRadius:14,padding:18}
const eyebrow={fontSize:10,fontWeight:800,color:'#5B6B7F',letterSpacing:'.08em',marginBottom:6}
