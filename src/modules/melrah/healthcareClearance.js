// MDR pre-dispatch eligibility evaluator; deliberately pure and fail-closed.
// Inputs must originate from verified, access-controlled server-side records.
// This helper cannot authenticate evidence or enforce authorization by itself.
// This helper is NOT a substitute for database authorization or hospital approval.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
function validDay(day) {
  if (!ISO_DAY.test(day ?? '')) return false
  const d = new Date(day + 'T00:00:00Z')
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === day
}
export function evaluateHealthcareClearance({ visit, technician, facilityPolicy, evidence = [] }) {
  const reasons = []
  if (!visit?.tenantId || !visit?.accountId || !visit?.facilityId || !validDay(visit?.scheduledFor) ||
      visit?.programKey !== 'HEALTHCARE_MDR') reasons.push('INVALID_VISIT')
  if (!technician?.id || technician.id !== visit?.qualifiedResourceId) reasons.push('TECHNICIAN_MISMATCH')
  if (!facilityPolicy?.verifiedAt || facilityPolicy.facilityId !== visit?.facilityId ||
      facilityPolicy.tenantId !== visit?.tenantId || facilityPolicy.accountId !== visit?.accountId ||
      facilityPolicy.status !== 'VERIFIED' || !validDay(facilityPolicy.verifiedAt?.slice?.(0,10)) ||
      facilityPolicy.verifiedAt.slice(0,10) > visit?.scheduledFor ||
      !validDay(facilityPolicy.expiresOn) || facilityPolicy.expiresOn < visit?.scheduledFor)
    reasons.push('FACILITY_POLICY_UNVERIFIED')
  const requirements = Array.isArray(facilityPolicy?.requirements) ? facilityPolicy.requirements : []
  if (!requirements.length) reasons.push('NO_VERIFIED_ACCESS_REQUIREMENTS')
  for (const req of requirements) {
    const matches = evidence.filter(e => e.requirementKey === req.key &&
      e.technicianId === technician?.id && e.tenantId === visit?.tenantId &&
      e.accountId === visit?.accountId &&
      e.facilityId === visit?.facilityId && e.providerKey === facilityPolicy?.providerKey &&
      e.status === 'VERIFIED' &&
      validDay(e.verifiedOn) && validDay(e.expiresOn) &&
      e.verifiedOn <= visit.scheduledFor && e.expiresOn >= visit.scheduledFor)
    if (!matches.length) reasons.push(`MISSING_OR_EXPIRED:${req.key}`)
  }
  return { eligible: reasons.length === 0, reasons }
}
