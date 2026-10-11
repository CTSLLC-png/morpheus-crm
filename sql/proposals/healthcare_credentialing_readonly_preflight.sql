-- READ-ONLY PREFLIGHT for PR #56. Execute against staging before deployment.
-- Failing checks are STOP signals, not reasons to weaken RLS.
select 'required_tables' as gate, bool_and(to_regclass(name) is not null) as passed
from (values ('core.tenant'),('core.membership'),('melrah.account'),
 ('melrah.facility'),('melrah.field_resource')) t(name);

select 'membership_roles' as gate, role, count(*) as memberships
from core.membership group by role order by role;

select 'field_resource_tenant_link' as gate,
 exists (select 1 from information_schema.columns
  where table_schema='melrah' and table_name='field_resource'
  and column_name='tenant_id') as has_direct_tenant_id;

select 'facility_account_integrity' as gate,
 count(*) filter (where a.id is null) as orphan_facilities
from melrah.facility f left join melrah.account a on a.id=f.account_id;

select 'existing_credentialing_tables' as gate,
 to_regclass('melrah.healthcare_facility_credentialing') as facility_table,
 to_regclass('melrah.healthcare_technician_clearance') as technician_table;

-- Mandatory staging gates before production:
-- Verify actual membership roles; never assume owner/admin.
-- Establish tenant binding for field_resource before clearance inserts.
-- Prevent cross-tenant technician/facility combinations in the database.
-- Enforce provider match with trusted facility policy.
-- Test RLS with two separate authenticated tenant identities.
-- Verify browser cannot write or access other tenants.
-- Check policy reruns, verifier provenance, audit log and dispatch RPC gate.
