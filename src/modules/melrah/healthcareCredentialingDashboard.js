// Pure coordinator dashboard projection. Call with access-controlled, server-verified records.
// Never treat these derived labels as authorization to dispatch.
export const CREDENTIALING_PROVIDERS = Object.freeze({
  INTELLICENTRICS: 'IntelliCentrics SEC³URE',
  SYMPLR: 'symplr',
  GHX_VENDOR_MATE: 'GHX Vendormate',
  GREEN_SECURITY: 'Green Security',
})
const DAY = /^\d{4}-\d{2}-\d{2}$/
const day = value => typeof value === 'string' && DAY.test(value) &&
  !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value

export function buildCredentialingDashboard({ facilities = [], technicians = [], clearances = [], visits = [], asOf }) {
  if (!day(asOf)) throw new Error('Valid asOf date required')
  const facilityById = new Map(facilities.map(f => [f.id, f]))
  const technicianById = new Map(technicians.map(t => [t.id, t]))
  const rows = []
  for (const clearance of clearances) {
    const facility = facilityById.get(clearance.facilityId)
    const technician = technicianById.get(clearance.technicianId)
    // Cross-client data mismatches must not be projected into the dashboard.
    if (!facility || !technician || !clearance.clientId ||
        facility.clientId !== clearance.clientId || technician.clientId !== clearance.clientId) continue
    const provider = facility.primaryCredentialingProvider
    const validProvider = Object.hasOwn(CREDENTIALING_PROVIDERS, provider)
    const verified = clearance.status === 'VERIFIED' &&
      clearance.provider === provider && validProvider &&
      day(clearance.verifiedAt) && clearance.verifiedAt <= asOf &&
      day(clearance.expiresAt) && clearance.expiresAt >= asOf
    const daysRemaining = day(clearance.expiresAt)
      ? Math.round((Date.parse(clearance.expiresAt + 'T00:00:00Z') - Date.parse(asOf + 'T00:00:00Z')) / 86400000)
      : null
    const status = verified ? (daysRemaining <= 60 ? 'EXPIRING' : 'CURRENT') :
      (clearance.status === 'SUSPENDED' ? 'SUSPENDED' :
      (daysRemaining !== null && daysRemaining < 0 ? 'EXPIRED' : 'NOT_VERIFIED'))
    const atRiskVisits = visits.filter(v => v.clientId === clearance.clientId &&
      v.facilityId === clearance.facilityId && v.technicianId === clearance.technicianId &&
      day(v.scheduledFor) && v.scheduledFor >= asOf &&
      (!verified || v.scheduledFor > clearance.expiresAt)).map(v => v.id)
    rows.push({
      clientId: clearance.clientId, facilityId: facility.id, facilityName: facility.name,
      technicianId: technician.id, technicianName: technician.name,
      provider, providerName: CREDENTIALING_PROVIDERS[provider] ?? 'Unknown',
      status, expiresAt: clearance.expiresAt ?? null, daysRemaining,
      atRiskVisitIds: atRiskVisits,
      renewalPriority: status === 'EXPIRING' && daysRemaining <= 7 ? '7_DAY' :
        status === 'EXPIRING' && daysRemaining <= 14 ? '14_DAY' :
        status === 'EXPIRING' && daysRemaining <= 30 ? '30_DAY' :
        status === 'EXPIRING' ? '60_DAY' : null,
    })
  }
  // An assigned visit without any clearance record must be visible as blocked.
  // Otherwise a missing registration disappears from the coordinator's dashboard.
  const knownPairs = new Set(rows.map(r => JSON.stringify([r.clientId, r.facilityId, r.technicianId])))
  for (const visit of visits) {
    if (!day(visit.scheduledFor) || visit.scheduledFor < asOf || !visit.id) continue
    const facility = facilityById.get(visit.facilityId)
    const technician = technicianById.get(visit.technicianId)
    if (!facility || !technician || !visit.clientId ||
        facility.clientId !== visit.clientId || technician.clientId !== visit.clientId) continue
    const key = JSON.stringify([visit.clientId, visit.facilityId, visit.technicianId])
    if (knownPairs.has(key)) continue
    knownPairs.add(key)
    const provider = facility.primaryCredentialingProvider
    rows.push({
      clientId: visit.clientId, facilityId: facility.id, facilityName: facility.name,
      technicianId: technician.id, technicianName: technician.name,
      provider, providerName: CREDENTIALING_PROVIDERS[provider] ?? 'Unknown',
      status: 'NOT_VERIFIED', expiresAt: null, daysRemaining: null,
      atRiskVisitIds: visits.filter(v => v.clientId === visit.clientId &&
        v.facilityId === visit.facilityId && v.technicianId === visit.technicianId &&
        day(v.scheduledFor) && v.scheduledFor >= asOf).map(v => v.id),
      renewalPriority: null,
    })
  }
  return {
    rows: rows.sort((a,b) => a.facilityName.localeCompare(b.facilityName) ||
      a.technicianName.localeCompare(b.technicianName)),
    summary: {
      total: rows.length,
      current: rows.filter(r => r.status === 'CURRENT').length,
      expiring: rows.filter(r => r.status === 'EXPIRING').length,
      blocked: rows.filter(r => !['CURRENT', 'EXPIRING'].includes(r.status)).length,
      atRiskVisits: new Set(rows.flatMap(r => r.atRiskVisitIds)).size,
    },
  }
}
