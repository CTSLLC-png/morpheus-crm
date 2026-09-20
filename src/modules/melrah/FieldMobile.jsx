import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { fromModuleSchema } from '../../lib/morpheus.js'
import { cachedRoute, cacheRoute, enqueue, flush, pending } from './fieldOffline.js'

const NEXT={DISPATCHED:'ACCEPTED',ACCEPTED:'EN_ROUTE',EN_ROUTE:'ARRIVED',ARRIVED:'IN_PROGRESS',IN_PROGRESS:'COMPLETED'}
const LABEL={ACCEPTED:'ACCEPT JOB',EN_ROUTE:'EN ROUTE',ARRIVED:'ARRIVED',IN_PROGRESS:'START COLLECTION',COMPLETED:'COMPLETE STOP'}
async function send(item){const fn=item.type==='transition'?'melrah_field_transition':'melrah_field_record_collection';const {error}=await supabase.rpc(fn,item.payload);if(error)throw error}

export default function FieldMobile(){
 const [rows,setRows]=useState(cachedRoute()),[active,setActive]=useState(null),[online,setOnline]=useState(navigator.onLine),[queued,setQueued]=useState(pending().length),[msg,setMsg]=useState('')
 async function load(){const r=await fromModuleSchema('melrah','service_appointment',q=>q.order('scheduled_start',{ascending:true}).limit(50));if(!r.error){setRows(r.data);cacheRoute(r.data);setActive(r.data.find(x=>!['COMPLETED','CANCELLED'].includes(x.status))||r.data[0]||null)}else{const c=cachedRoute();setActive(c.find(x=>!['COMPLETED','CANCELLED'].includes(x.status))||c[0]||null)}}
 useEffect(()=>{load()},[])
 useEffect(()=>{const on=async()=>{setOnline(true);setQueued(await flush(send));load()},off=()=>setOnline(false);addEventListener('online',on);addEventListener('offline',off);return()=>{removeEventListener('online',on);removeEventListener('offline',off)}},[])
 async function step(){const status=NEXT[active?.status];if(!status)return;const item={type:'transition',payload:{p_appointment_id:active.id,p_status:status}};try{if(!online)throw Error();await send(item);setMsg(LABEL[status]+' saved')}catch{setQueued(enqueue(item));setMsg('Saved offline — automatic sync queued')}setActive({...active,status})}
 const next=NEXT[active?.status]
 return <main className='field-mobile'>
  <header><div><small>MELRAH FIELD™</small><h2>Today’s Route</h2></div><b className={online?'field-online':'field-offline'}>{online?'ONLINE':'OFFLINE'} · {queued} QUEUED</b></header>
  {!active?<section className='field-card'>No assigned stops. {rows.length?'Route complete.':'Connect once to download the Route Briefcase.'}</section>:<>
   <section className='field-card'><small>NEXT STOP</small><h1>{active.route_name||'Collection Route'}</h1><p>{active.scheduled_start?new Date(active.scheduled_start).toLocaleString():'Unscheduled'} · Stop {active.sequence_no||'—'}</p><strong>{active.status.replace('_',' ')}</strong></section>
   <section className='field-card'><small>GUIDED WORKFLOW</small><p className='field-help'>One action at a time. Morpheus timestamps each step and keeps it in your Route Briefcase if service drops.</p>{next&&<button className='field-primary' onClick={step}>{LABEL[next]}</button>}</section>
   <section className='field-card'><small>COLLECTION CHECKLIST</small>{['Scan station/container QR','Before photo','Fill level','Weight / package count','Contamination','Seal + bag ID','After photo','Complete custody record'].map(x=><div className='field-check' key={x}>□ {x}</div>)}</section>
   {msg&&<div className='field-message' role='status'>{msg}</div>}
  </>}
  <nav className='field-tabs'><button>TODAY</button><button onClick={()=>setMsg('Map/navigation handoff is next in the mobile release.')}>MAP</button><button onClick={()=>setMsg('QR camera scanner is next in the mobile release.')}>SCAN</button><button onClick={async()=>setQueued(await flush(send))}>SYNC</button></nav>
 </main>
}