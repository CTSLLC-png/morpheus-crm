// MDR dispatch guard contract. A verified, server-issued clearance decision is
// required before any healthcare assignment is sent to the dispatch RPC.
// This client helper is defense in depth ONLY; enforce the same rule inside
// melrah_dispatch_assign and melrah_dispatch_set_status before production use.
export function healthcareDispatchGate({ order, resourceId, clearance }) {
  if (order?.program_key !== 'HEALTHCARE_MDR') return { allowed: true, reason: null }
  if (!resourceId) return { allowed: false, reason: 'TECHNICIAN_REQUIRED' }
  if (!clearance || clearance.source !== 'SERVER_VERIFIED' || clearance.eligible !== true)
    return { allowed: false, reason: 'VERIFIED_CLEARANCE_REQUIRED' }
  if (clearance.workOrderId !== order.id || clearance.resourceId !== resourceId ||
      clearance.clientId !== order.client_id || clearance.facilityId !== order.facility_id ||
      clearance.serviceDate !== order.scheduled_for)
    return { allowed: false, reason: 'CLEARANCE_SCOPE_MISMATCH' }
  if (!clearance.decisionId || !clearance.expiresAt ||
      !Number.isFinite(Date.parse(clearance.expiresAt)) ||
      Date.parse(clearance.expiresAt) <= Date.now())
    return { allowed: false, reason: 'CLEARANCE_DECISION_EXPIRED' }
  return { allowed: true, reason: null }
}
