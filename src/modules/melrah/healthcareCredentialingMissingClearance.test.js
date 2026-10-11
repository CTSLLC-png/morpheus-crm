import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCredentialingDashboard } from './healthcareCredentialingDashboard.js'

const facilities = [{ id:'f1', clientId:'a', name:'Hospital A', primaryCredentialingProvider:'SYMPLR' }]
const technicians = [{ id:'t1', clientId:'a', name:'Technician A' }]
const visits = [{ id:'v1', clientId:'a', facilityId:'f1', technicianId:'t1', scheduledFor:'2026-10-20' }]

test('unregistered assigned technician is blocked and visit is counted at risk', () => {
  const result = buildCredentialingDashboard({ facilities, technicians, visits, asOf:'2026-10-11' })
  assert.equal(result.summary.blocked, 1)
  assert.equal(result.summary.atRiskVisits, 1)
  assert.equal(result.rows[0].status, 'NOT_VERIFIED')
  assert.deepEqual(result.rows[0].atRiskVisitIds, ['v1'])
})

test('multiple visits with missing clearance produce one row and all at-risk visits', () => {
  const result = buildCredentialingDashboard({ facilities, technicians, visits:[
    ...visits, {...visits[0],id:'v2',scheduledFor:'2026-10-21'}
  ], asOf:'2026-10-11' })
  assert.equal(result.rows.length, 1)
  assert.equal(result.summary.atRiskVisits, 2)
})

test('cross-client visit cannot generate a credentialing row', () => {
  const result = buildCredentialingDashboard({ facilities, technicians,
    visits:[{...visits[0],clientId:'other'}], asOf:'2026-10-11' })
  assert.equal(result.rows.length, 0)
})

test('existing clearance row is not duplicated by its visit', () => {
  const result = buildCredentialingDashboard({ facilities, technicians, visits,
    clearances:[{clientId:'a',facilityId:'f1',technicianId:'t1',provider:'SYMPLR',
      status:'VERIFIED',verifiedAt:'2026-10-01',expiresAt:'2027-01-01'}],asOf:'2026-10-11' })
  assert.equal(result.rows.length, 1)
  assert.equal(result.summary.atRiskVisits, 0)
})
