// Healthcare monthly scheduling helpers. Pure and deterministic; no database writes.
// Dates are local calendar dates (YYYY-MM-DD), never inferred from UTC timestamps.
export function buildMonthlyHealthcareVisits({ year, month, rules = [], exceptions = [] }) {
  if (!Number.isInteger(year) || year < 2000 || !Number.isInteger(month) || month < 1 || month > 12)
    throw new Error('Invalid calendar month')
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const blocked = new Set(exceptions.filter(e => e.type === 'SKIP').map(e => [e.ruleId, e.date].join('|')))
  const visits = []
  for (const rule of rules) {
    if (!rule.id || !rule.clientId || !rule.facilityId || !Number.isInteger(rule.weekday) ||
      rule.weekday < 0 || rule.weekday > 6) throw new Error('Invalid recurring healthcare rule')
    for (let day = 1; day <= last; day++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() !== rule.weekday) continue
      if (blocked.has([rule.id, date].join('|'))) continue
      visits.push({
        id: `${rule.id}:${date}`, ruleId: rule.id, programKey: 'HEALTHCARE_MDR',
        clientId: rule.clientId, facilityId: rule.facilityId, scheduledFor: date,
        qualifiedResourceId: rule.qualifiedResourceId ?? null, status: 'PLANNED'
      })
    }
  }
  return visits.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor) || a.id.localeCompare(b.id))
}

export function findUncoveredHealthcareVisits(visits, qualifications = {}) {
  return (visits ?? []).filter(v => !v.qualifiedResourceId ||
    !Array.isArray(qualifications[v.qualifiedResourceId]) ||
    !qualifications[v.qualifiedResourceId].includes(v.clientId))
}

// Deliberately preserve program/customer identity during backup reassignment.
export function reassignHealthcareVisit(visit, replacementId, qualifications = {}) {
  if (!replacementId || !qualifications[replacementId]?.includes(visit.clientId))
    throw new Error('Replacement technician not qualified for client')
  return { ...visit, qualifiedResourceId: replacementId, coverageReason: 'CONTINGENCY' }
}
