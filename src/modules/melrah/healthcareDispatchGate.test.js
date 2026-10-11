import test from 'node:test'
import assert from 'node:assert/strict'
import { healthcareDispatchGate } from './healthcareDispatchGate.js'
const order={id:'wo-1',program_key:'HEALTHCARE_MDR',tenant_id:'tenant-a',account_id:'cardinal',facility_id:'burlington',scheduled_for:'2026-11-20'}
const clearance={source:'SERVER_VERIFIED',eligible:true,workOrderId:'wo-1',resourceId:'tech-1',tenantId:'tenant-a',accountId:'cardinal',facilityId:'burlington',serviceDate:'2026-11-20',decisionId:'decision-1',expiresAt:'2099-01-01T00:00:00Z'}
test('no verified server decision blocks healthcare dispatch',()=>assert.equal(healthcareDispatchGate({order,resourceId:'tech-1'}).allowed,false))
test('wrong account or technician cannot reuse clearance',()=>{
 assert.equal(healthcareDispatchGate({order,resourceId:'tech-1',clearance:{...clearance,accountId:'medtronic'}}).allowed,false)
 assert.equal(healthcareDispatchGate({order,resourceId:'tech-2',clearance}).allowed,false)
})
test('expired decision blocks dispatch',()=>assert.equal(healthcareDispatchGate({order,resourceId:'tech-1',clearance:{...clearance,expiresAt:'2020-01-01T00:00:00Z'}}).allowed,false))
test('scoped server decision passes contract',()=>assert.equal(healthcareDispatchGate({order,resourceId:'tech-1',clearance}).allowed,true))
test('coffee dispatch unaffected',()=>assert.equal(healthcareDispatchGate({order:{program_key:'ORGANICS_COFFEE'},resourceId:'tech-1'}).allowed,true))

test('cross-tenant decision cannot be reused',()=>assert.equal(healthcareDispatchGate({order,resourceId:'tech-1',clearance:{...clearance,tenantId:'tenant-b'}}).allowed,false))
test('missing work-order tenant blocks healthcare dispatch',()=>assert.equal(healthcareDispatchGate({order:{...order,tenant_id:undefined},resourceId:'tech-1',clearance}).allowed,false))
test('legacy client-only clearance cannot authorize healthcare dispatch',()=>assert.equal(healthcareDispatchGate({order,resourceId:'tech-1',clearance:{...clearance,tenantId:undefined,accountId:undefined,clientId:'cardinal'}}).allowed,false))
