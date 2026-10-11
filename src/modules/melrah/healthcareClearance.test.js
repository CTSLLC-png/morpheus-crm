import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateHealthcareClearance } from './healthcareClearance.js'
const visit={clientId:'cardinal',facilityId:'burlington-demo',scheduledFor:'2026-11-20',programKey:'HEALTHCARE_MDR',qualifiedResourceId:'tech-1'}
const technician={id:'tech-1'}
const facilityPolicy={facilityId:'burlington-demo',clientId:'cardinal',status:'VERIFIED',verifiedAt:'2026-10-11',requirements:[{key:'symplr-clearance'},{key:'hospital-badge'}]}
const evidence=[
 {requirementKey:'symplr-clearance',technicianId:'tech-1',clientId:'cardinal',facilityId:'burlington-demo',status:'VERIFIED',verifiedOn:'2026-10-11',expiresOn:'2026-12-01'},
 {requirementKey:'hospital-badge',technicianId:'tech-1',clientId:'cardinal',facilityId:'burlington-demo',status:'VERIFIED',verifiedOn:'2026-10-11',expiresOn:'2026-11-30'}
]
test('all verified clearances permit visit eligibility',()=>assert.equal(evaluateHealthcareClearance({visit,technician,facilityPolicy,evidence}).eligible,true))
test('expired symplr registration blocks future visit',()=>{
 const stale=evidence.map(e=>e.requirementKey==='symplr-clearance'?{...e,expiresOn:'2026-11-15'}:e)
 assert.equal(evaluateHealthcareClearance({visit,technician,facilityPolicy,evidence:stale}).eligible,false)
})
test('clearance for competing customer is not transferable',()=>{
 const wrong=evidence.map(e=>({...e,clientId:'medtronic'}))
 assert.equal(evaluateHealthcareClearance({visit,technician,facilityPolicy,evidence:wrong}).eligible,false)
})
test('missing or unverified hospital policy blocks assignment',()=>{
 assert.equal(evaluateHealthcareClearance({visit,technician,facilityPolicy:null,evidence}).eligible,false)
})
test('credential from another facility does not grant access',()=>{
 const wrong=evidence.map(e=>({...e,facilityId:'another-hospital'}))
 assert.equal(evaluateHealthcareClearance({visit,technician,facilityPolicy,evidence:wrong}).eligible,false)
})
