// MDR healthcare readiness: pure checks, safe to run against synthetic data.
// No database writes or customer information.
export function validateHealthcareVisit(visit) {
  const errors = []
  if (!visit?.clientId) errors.push('CLIENT_REQUIRED')
  if (!visit?.facilityId) errors.push('FACILITY_REQUIRED')
  if (!visit?.scheduledFor) errors.push('DATE_REQUIRED')
  if (!visit?.qualifiedResourceId) errors.push('QUALIFIED_TECH_REQUIRED')
  if (!visit?.programKey || visit.programKey !== 'HEALTHCARE_MDR') errors.push('MDR_PROGRAM_REQUIRED')
  return { valid: errors.length === 0, errors }
}

export function findHealthcareScheduleConflicts(visits) {
  const seen = new Map()
  const conflicts = []
  for (const visit of visits ?? []) {
    const key = [visit.qualifiedResourceId, visit.scheduledFor].join('|')
    if (!visit.qualifiedResourceId || !visit.scheduledFor) continue
    if (seen.has(key)) conflicts.push({ firstId: seen.get(key), secondId: visit.id, type: 'RESOURCE_DATE_COLLISION' })
    else seen.set(key, visit.id)
  }
  return conflicts
}

// Prevent inadvertent commingling in application workflows.
// Production enforcement MUST also exist in database RLS/RPC authorization.
export function canAccessHealthcareWorkOrder(context, order) {
  return Boolean(context?.tenantId && context?.clientId && order?.tenantId &&
    context.tenantId === order.tenantId && context.clientId === order.clientId &&
    order.programKey === 'HEALTHCARE_MDR')
}
