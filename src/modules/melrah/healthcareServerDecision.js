// A pure, non-authoritative decision model for the future transactional server gate.
// NEVER use client-supplied inputs from this module as permission to dispatch.
const validDay = day => {
  if (typeof day !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(day)) return false
  const d = new Date(day + 'T00:00:00Z')
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === day
}
const verifiedOnDay = (item, day) =>
  item?.status === 'VERIFIED' &&
  validDay(item.verifiedOn) && validDay(item.expiresOn) &&
  item.verifiedOn <= day && item.expiresOn >= day

export function evaluateHealthcareServerDecision({ order, technician, policy, requirements, evidence }) {
  const reasons = []
  if (order?.program_key !== 'HEALTHCARE_MDR' ||
      !order?.id || !order?.tenant_id || !order?.account_id ||
      !order?.facility_id || !validDay(order?.scheduled_for)) reasons.push('INVALID_ORDER')
  if (!technician?.id || !technician.active ||
      technician.tenantId !== order?.tenant_id) reasons.push('TECHNICIAN_NOT_ENROLLED')
  if (!policy?.tenantId || policy.tenantId !== order?.tenant_id ||
      policy.accountId !== order?.account_id ||
      policy.facilityId !== order?.facility_id ||
      !policy.providerKey || !verifiedOnDay(policy, order?.scheduled_for))
    reasons.push('POLICY_NOT_VERIFIED_FOR_DATE')
  if (!Array.isArray(requirements) || requirements.length === 0)
    reasons.push('REQUIREMENTS_NOT_ESTABLISHED')
  else for (const requirement of requirements) {
    if (!requirement?.key || requirement.tenantId !== order?.tenant_id ||
        requirement.facilityId !== order?.facility_id ||
        requirement.providerKey !== policy?.providerKey ||
        requirement.active !== true) {
      reasons.push('INVALID_REQUIREMENT')
      continue
    }
    if (requirement.required !== true) continue
    const matching = Array.isArray(evidence) ? evidence.filter(e =>
      e.requirementKey === requirement.key &&
      e.tenantId === order.tenant_id &&
      e.accountId === order.account_id &&
      e.facilityId === order.facility_id &&
      e.providerKey === policy.providerKey &&
      e.technicianId === technician?.id &&
      Boolean(e.verifiedBy) && Boolean(e.sourceSystem) &&
      Boolean(e.externalReference) &&
      verifiedOnDay(e, order.scheduled_for)) : []
    if (matching.length === 0) reasons.push('MISSING_VERIFIED_EVIDENCE:' + requirement.key)
  }
  return { eligible: reasons.length === 0, reasons }
}
