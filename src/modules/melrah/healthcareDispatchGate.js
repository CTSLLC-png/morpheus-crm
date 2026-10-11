// MDR dispatch guard contract. A verified, server-issued clearance decision is
// required before any healthcare assignment is sent to the dispatch RPC.
// Uses actual work_order tenant_id/account_id fields, not a nonexistent client_id.
// This client helper is defense in depth ONLY; enforce the same rule inside
// melrah_dispatch_assign and melrah_dispatch_set_status before production use.
export function healthcareDispatchGate({ order, resourceId, clearance }) {
  if (order?.program_key !== 'HEALTHCARE_MDR') return { allowed: true, reason: null }
  if (!resourceId) return { allowed: false, reason: 'TECHNICIAN_REQUIRED' }
  if (!clearance || clearance.source !== 'SERVER_VERIFIED' || clearance.eligible !== true)
    return { allowed: false, reason: 'VERIFIED_CLEARANCE_REQUIRED' }
  if (clearance.workOrderId !== order.id || clearance.resourceId !== resourceId ||
      !order.tenant_id || !order.account_id || !order.facility_id ||
      clearance.tenantId !== order.tenant_id || clearance.accountId !== order.account_id ||
      clearance.facilityId !== order.facility_id ||
      clearance.serviceDate !== order.scheduled_for)
    return { allowed: false, reason: 'CLEARANCE_SCOPE_MISMATCH' }
  if (!clearance.decisionId || !clearance.expiresAt ||
      !Number.isFinite(Date.parse(clearance.expiresAt)) ||
      Date.parse(clearance.expiresAt) <= Date.now())
    return { allowed: false, reason: 'CLEARANCE_DECISION_EXPIRED' }
  return { allowed: true, reason: null }
}
