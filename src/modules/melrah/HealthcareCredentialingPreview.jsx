import { useMemo, useState } from 'react'
import { buildCredentialingDashboard } from './healthcareCredentialingDashboard.js'

// Explicitly fictional records. This preview is not connected to hospital portals or production data.
const facilities = [
  { id:'demo-f1', clientId:'demo-client', name:'DEMO — Capital Region Hospital', primaryCredentialingProvider:'INTELLICENTRICS' },
  { id:'demo-f2', clientId:'demo-client', name:'DEMO — Mohawk Medical Center', primaryCredentialingProvider:'SYMPLR' },
]
const technicians = [
  { id:'demo-t1', clientId:'demo-client', name:'DEMO — Technician A' },
  { id:'demo-t2', clientId:'demo-client', name:'DEMO — Technician B' },
]
const datePlus = (today, offset) => {
  const d = new Date(today + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0,10)
}
export default function HealthcareCredentialingPreview() {
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0,10))
  const model = useMemo(() => {
    try {
      return buildCredentialingDashboard({
        asOf, facilities, technicians,
        clearances: [
          {clientId:'demo-client',facilityId:'demo-f1',technicianId:'demo-t1',provider:'INTELLICENTRICS',
           status:'VERIFIED',verifiedAt:datePlus(asOf,-10),expiresAt:datePlus(asOf,12)},
          {clientId:'demo-client',facilityId:'demo-f2',technicianId:'demo-t2',provider:'SYMPLR',
           status:'PENDING',verifiedAt:null,expiresAt:null},
        ],
        visits: [{id:'DEMO-VISIT-001',clientId:'demo-client',facilityId:'demo-f1',
          technicianId:'demo-t1',scheduledFor:datePlus(asOf,20)}],
      })
    } catch { return null }
  }, [asOf])
  return (
    <section aria-label="Healthcare credentialing demonstration" style={{padding:24,maxWidth:1150,margin:'auto'}}>
      <div role="status" style={{padding:14,background:'#fff4ce',color:'#573b00',fontWeight:700}}>
        DEMONSTRATION ONLY — Fictional hospitals and technicians. Not connected to live credentialing or dispatch.
      </div>
      <h1>Melrah Healthcare · Credentialing Overview</h1>
      <p>Coordinator preview: one primary credentialing platform per facility. This screen does not grant hospital access.</p>
      <label>Review date <input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} /></label>
      {model ? <>
        <p aria-live="polite"><strong>{model.summary.total}</strong> records · <strong>{model.summary.expiring}</strong> expiring · <strong>{model.summary.blocked}</strong> not verified · <strong>{model.summary.atRiskVisits}</strong> visits at risk</p>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>{['Facility','Technician','Provider','Status','Expiration','Renewal','Visits at risk'].map(x=><th key={x} scope="col" style={{textAlign:'left',padding:10,borderBottom:'2px solid #888'}}>{x}</th>)}</tr></thead>
            <tbody>{model.rows.map(r=><tr key={r.facilityId+':'+r.technicianId}>
              {[r.facilityName,r.technicianName,r.providerName,r.status,r.expiresAt??'Unknown',r.renewalPriority??'—',r.atRiskVisitIds.join(', ')||'—'].map((x,i)=><td key={i} style={{padding:10,borderBottom:'1px solid #ddd'}}>{x}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </> : <p role="alert">Enter a valid review date.</p>}
      <p><small>Real deployment requires access-controlled records, coordinator authorization, and server-side dispatch enforcement.</small></p>
    </section>
  )
}
