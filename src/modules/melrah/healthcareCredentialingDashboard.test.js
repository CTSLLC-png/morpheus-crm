import { describe, it, expect } from 'vitest'
import { buildCredentialingDashboard } from './healthcareCredentialingDashboard'

const facilities = [{ id:'f1', clientId:'c1', name:'Albany Hospital', primaryCredentialingProvider:'SYMPLR' }]
const technicians = [{ id:'t1', clientId:'c1', name:'Alex' }]
const base = { clientId:'c1', facilityId:'f1', technicianId:'t1', provider:'SYMPLR',
  status:'VERIFIED', verifiedAt:'2026-01-01', expiresAt:'2026-10-20' }
const build = (overrides={}) => buildCredentialingDashboard({
  facilities, technicians, clearances:[{...base,...overrides}],
  visits:[{id:'v1',clientId:'c1',facilityId:'f1',technicianId:'t1',scheduledFor:'2026-10-21'}],
  asOf:'2026-10-11',
})
describe('centralized credentialing dashboard projection', () => {
  it('warns before expiry and flags visit beyond clearance', () => {
    const r=build()
    expect(r.rows[0].status).toBe('EXPIRING')
    expect(r.rows[0].renewalPriority).toBe('14_DAY')
    expect(r.rows[0].atRiskVisitIds).toEqual(['v1'])
  })
  it('fails closed for wrong provider', () => expect(build({provider:'GREEN_SECURITY'}).rows[0].status).toBe('NOT_VERIFIED'))
  it('fails closed for unknown verification', () => expect(build({status:'PENDING'}).summary.blocked).toBe(1))
  it('recognizes expiry', () => expect(build({expiresAt:'2026-10-01'}).rows[0].status).toBe('EXPIRED'))
  it('does not display cross-client clearance records', () => expect(build({clientId:'other'}).summary.total).toBe(0))
  it('rejects invalid as-of dates', () => expect(() => buildCredentialingDashboard({asOf:'2026-02-30'})).toThrow())
})
