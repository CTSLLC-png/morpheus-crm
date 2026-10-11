import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMonthlyHealthcareVisits, findUncoveredHealthcareVisits, reassignHealthcareVisit } from './healthcareMonthlyPlanning.js'

const rules = [
  { id: 'cardinal-mon', clientId: 'cardinal', facilityId: 'demo-burlington', weekday: 1, qualifiedResourceId: 'tech-1' },
  { id: 'medtronic-thu', clientId: 'medtronic', facilityId: 'demo-burlington', weekday: 4, qualifiedResourceId: 'tech-1' }
]

test('two clients retain separate days and visits at one mock hospital', () => {
  const visits = buildMonthlyHealthcareVisits({ year: 2026, month: 11, rules })
  assert.equal(visits.length, 9)
  assert.equal(visits.filter(v => v.clientId === 'cardinal').length, 5)
  assert.equal(visits.filter(v => v.clientId === 'medtronic').length, 4)
  assert.ok(visits.every(v => v.programKey === 'HEALTHCARE_MDR'))
  assert.equal(new Set(visits.map(v => v.id)).size, visits.length)
})

test('skip exception excludes only the intended customer service', () => {
  const visits = buildMonthlyHealthcareVisits({
    year: 2026, month: 11, rules,
    exceptions: [{ type: 'SKIP', ruleId: 'cardinal-mon', date: '2026-11-02' }]
  })
  assert.equal(visits.length, 8)
  assert.ok(visits.some(v => v.clientId === 'medtronic'))
})

test('unqualified backup cannot be assigned to competing client', () => {
  const visit = buildMonthlyHealthcareVisits({ year: 2026, month: 11, rules })[0]
  assert.throws(() => reassignHealthcareVisit(visit, 'backup', { backup: ['medtronic'] }))
  const reassigned = reassignHealthcareVisit(visit, 'backup', { backup: ['cardinal'] })
  assert.equal(reassigned.clientId, 'cardinal')
  assert.equal(reassigned.coverageReason, 'CONTINGENCY')
})

test('missing qualification or assignment creates uncovered service alert', () => {
  const visits = buildMonthlyHealthcareVisits({ year: 2026, month: 11, rules })
  assert.equal(findUncoveredHealthcareVisits(visits, { 'tech-1': ['cardinal'] }).length, 4)
})
