import { useEffect, useMemo, useState } from 'react'
import { fromModuleSchema } from '../../lib/morpheus.js'
import { ModuleHeader, Pill, Table, styles } from '../common/ModuleFrame.jsx'

const SCHEMA='melrah'

export default function MelrahStations(){
  const [locations,setLocations]=useState([])
  const [stations,setStations]=useState([])
  const [containers,setContainers]=useState([])

  useEffect(()=>{
    fromModuleSchema(SCHEMA,'service_location',q=>q.order('name')).then(r=>setLocations(r.data??[]))
    fromModuleSchema(SCHEMA,'collection_station',q=>q.order('station_code')).then(r=>setStations(r.data??[]))
    fromModuleSchema(SCHEMA,'collection_container',q=>q.order('container_code')).then(r=>setContainers(r.data??[]))
  },[])

  const active=useMemo(()=>stations.filter(s=>s.status==='ACTIVE').length,[stations])
  const primary=containers.filter(c=>c.material_stream==='FLEXIBLE_POUCH').length

  return <div>
    <ModuleHeader title="Collection Stations" subtitle="Locations, station assets, QR containers and stream configuration" right={<div style={{display:'flex',gap:8}}><Pill tone="good">{active} active</Pill><Pill tone="info">{primary} pouch bins</Pill></div>}/>
    <div style={{overflowX:'auto'}}><Table
      columns={['Station','Location','Status','Containers','Primary stream']}
      rows={stations}
      keyOf={s=>s.id}
      renderRow={s=>{
        const loc=locations.find(l=>l.id===s.location_id)
        const cs=containers.filter(c=>c.station_id===s.id)
        return <>
          <td style={{...styles.td,fontFamily:'monospace',fontWeight:600}}>{s.station_code}</td>
          <td style={styles.td}>{loc?.name??'—'}</td>
          <td style={styles.td}><Pill tone={s.status==='ACTIVE'?'good':'neutral'}>{s.status}</Pill></td>
          <td style={styles.td}>{cs.length}</td>
          <td style={styles.td}>{cs.some(c=>c.material_stream==='FLEXIBLE_POUCH')?'Flexible Pouches':'—'}</td>
        </>
      }}
    /></div>
  </div>
}
