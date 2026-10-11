import test from 'node:test'
import assert from 'node:assert/strict'
import { validateHealthcareVisit, findHealthcareScheduleConflicts, canAccessHealthcareWorkOrder } from './healthcareReadiness.js'

test('healthcare visit requires client, facility, schedule, qualified technician and MDR program', () => {
  assert.deepEqual(validateHealthcareVisit({}).errors, [
    'CLIENT_REQUIRED', 'FACILITY_REQUIRED', 'DATE_REQUIRED', 'QUALIFIED_TECH_REQUIRED', 'MDR_PROGRAM_REQUIRED'
  ])
  assert.equal(validateHealthcareVisit({
    clientId:'cardinal', facilityId:'demo-burlington', scheduledFor:'2026-11-02',
    qualifiedResourceId:'tech-1', programKey:'HEALTHCARE_MDR'
  }).valid, true)
})

test('same technician cannot silently receive two same-day visits', () => {
  assert.equal(findHealthcareScheduleConflicts([
    {id:'a',qualifiedResourceId:'tech-1',scheduledFor:'2026-11-02'},
    {id:'b',qualifiedResourceId:'tech-1',scheduledFor:'2026-11-02'}
  ]).length,1)
})

test('client A cannot access client B MDR work orders', () => {
  const context = {tenantId:'melrah',clientId:'cardinal'}
  assert.equal(canAccessHealthcareWorkOrder(context,{
    tenantId:'melrah',clientId:'medtronic',programKey:'HEALTHCARE_MDR'
  }),false)
  assert.equal(canAccessHealthcareWorkOrder(context,{
    tenantId:'melrah',clientId:'cardinal',programKey:'HEALTHCARE_MDR'
  }),true)
})
