// Static contract checks only. These do not replace PostgreSQL FK/RLS tests.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../proposals/healthcare_credential_evidence_staging.sql', import.meta.url), 'utf8')
const required = [
  /CREATE TABLE IF NOT EXISTS melrah\.healthcare_facility_requirement/i,
  /CREATE TABLE IF NOT EXISTS melrah\.healthcare_credential_evidence/i,
  /UNIQUE \(id, tenant_id, facility_id, provider_key\)/i,
  /FOREIGN KEY \(requirement_id, tenant_id, facility_id, provider_key\)/i,
  /FOREIGN KEY \(tenant_id, technician_id\)/i,
  /FOREIGN KEY \(tenant_id, facility_id, provider_key\)/i,
  /expires_at > verified_at/i,
  /verified_by IS NOT NULL/i,
  /source_system IS NOT NULL/i,
  /external_reference IS NOT NULL/i,
  /ALTER TABLE melrah\.healthcare_facility_requirement ENABLE ROW LEVEL SECURITY/i,
  /ALTER TABLE melrah\.healthcare_credential_evidence ENABLE ROW LEVEL SECURITY/i,
  /REVOKE ALL ON melrah\.healthcare_facility_requirement FROM PUBLIC, anon, authenticated/i,
  /REVOKE ALL ON melrah\.healthcare_credential_evidence FROM PUBLIC, anon, authenticated/i,
]
for (const [index, pattern] of required.entries()) {
  test(`credential evidence SQL static contract ${index + 1}`, () => {
    assert.match(sql, pattern)
  })
}
test('proposal has no application-role grants', () => {
  assert.doesNotMatch(sql, /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\s+ON\s+melrah\.healthcare_(?:facility_requirement|credential_evidence)\b/i)
})
