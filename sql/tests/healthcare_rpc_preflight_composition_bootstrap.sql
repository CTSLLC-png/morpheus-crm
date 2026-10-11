-- CI-only: exact RPC and actual preflight composed against fail-closed
-- work-order trigger. Preflight dependency signatures are isolated doubles.
ALTER TABLE melrah.work_order ADD COLUMN tenant_id uuid;
ALTER TABLE melrah.work_order ADD COLUMN account_id uuid;
ALTER TABLE melrah.work_order ADD COLUMN facility_id uuid;
ALTER TABLE melrah.work_order ADD COLUMN scheduled_for date;
CREATE TABLE melrah.healthcare_access_exception(id uuid PRIMARY KEY,requirement_id uuid);
CREATE TABLE melrah.healthcare_access_exclusion(
 tenant_id uuid,facility_id uuid,technician_id uuid,active boolean,effective_at timestamptz);
CREATE FUNCTION melrah.healthcare_lock_facility_policy(uuid,uuid)
 RETURNS void LANGUAGE sql AS 'SELECT';
CREATE FUNCTION melrah.healthcare_lock_dispatch_safety_scope(uuid,uuid,uuid)
 RETURNS void LANGUAGE sql AS 'SELECT';
CREATE FUNCTION melrah.healthcare_evidence_eligible(uuid,uuid)
 RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION melrah.healthcare_exception_lock_for_dispatch(uuid)
 RETURNS melrah.healthcare_access_exception LANGUAGE sql AS
 'SELECT * FROM melrah.healthcare_access_exception WHERE false';
CREATE FUNCTION melrah.healthcare_exception_matches_visit(uuid,uuid,uuid,uuid,timestamptz)
 RETURNS boolean LANGUAGE sql AS 'SELECT false';
