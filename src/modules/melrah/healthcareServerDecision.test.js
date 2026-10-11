import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateHealthcareServerDecision as decide } from './healthcareServerDecision.js'
const order={id:'wo1',tenant_id:'tenant1',account_id:'account1',facility_id:'hospital1',scheduled_for:'2026-11-20',program_key:'HEALTHCARE_MDR'}
const technician={id:'tech1',tenantId:'tenant1',active:true}
const policy={tenantId:'tenant1',accountId:'account1',facilityId:'hospital1',providerKey:'SYMPLR',status:'VERIFIED',verifiedOn:'2026-10-01',expiresOn:'2026-12-31'}
const requirements=[{key:'badge',tenantId:'tenant1',facilityId:'hospital1',providerKey:'SYMPLR',active:true,required:true}]
const evidence=[{requirementKey:'badge',tenantId:'tenant1',accountId:'account1',facilityId:'hospital1',providerKey:'SYMPLR',technicianId:'tech1',status:'VERIFIED',verifiedOn:'2026-10-01',expiresOn:'2026-12-31',verifiedBy:'verifier1',sourceSystem:'SYMPLR',externalReference:'record1'}]
const evaluate=(changes={})=>decide({order,technician,policy,requirements,evidence,...changes})
test('complete verified facility evidence permits eligibility model',()=>assert.equal(evaluate().eligible,true))
test('revoked evidence fails closed',()=>assert.equal(evaluate({evidence:[{...evidence[0],status:'REVOKED'}]}).eligible,false))
test('expired evidence fails closed',()=>assert.equal(evaluate({evidence:[{...evidence[0],expiresOn:'2026-11-19'}]}).eligible,false))
test('wrong tenant fails closed',()=>assert.equal(evaluate({evidence:[{...evidence[0],tenantId:'tenant2'}]}).eligible,false))
test('wrong facility fails closed',()=>assert.equal(evaluate({evidence:[{...evidence[0],facilityId:'hospital2'}]}).eligible,false))
test('wrong provider fails closed',()=>assert.equal(evaluate({evidence:[{...evidence[0],providerKey:'GHX_VENDOR_MATE'}]}).eligible,false))
test('unverified policy fails closed',()=>assert.equal(evaluate({policy:{...policy,status:'SUSPENDED'}}).eligible,false))
test('expired policy fails closed',()=>assert.equal(evaluate({policy:{...policy,expiresOn:'2026-11-19'}}).eligible,false))
test('missing evidence provenance fails closed',()=>assert.equal(evaluate({evidence:[{...evidence[0],verifiedBy:null}]}).eligible,false))
test('inactive technician fails closed',()=>assert.equal(evaluate({technician:{...technician,active:false}}).eligible,false))
test('missing requirements fail closed',()=>assert.equal(evaluate({requirements:[]}).eligible,false))
test('missing evidence fails closed',()=>assert.equal(evaluate({evidence:[]}).eligible,false))
