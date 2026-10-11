-- Disposable schema sufficient to run REAL evidence eligibility and REAL
-- integrated preflight; exception functions are not exercised in this suite.
CREATE SCHEMA melrah; CREATE SCHEMA core;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE TABLE melrah.account(id uuid PRIMARY KEY,tenant_id uuid NOT NULL);
CREATE TABLE melrah.facility(id uuid PRIMARY KEY,account_id uuid NOT NULL);
CREATE TABLE melrah.field_resource(id uuid PRIMARY KEY,active boolean NOT NULL);
CREATE TABLE melrah.work_order(id uuid PRIMARY KEY,tenant_id uuid,account_id uuid,
 facility_id uuid,scheduled_for date,program_key text,status text,assigned_resource_id uuid);
CREATE TABLE melrah.healthcare_facility_scope(tenant_id uuid,facility_id uuid);
CREATE TABLE melrah.healthcare_technician_tenant(tenant_id uuid,technician_id uuid);
CREATE TABLE melrah.healthcare_facility_credentialing(tenant_id uuid,facility_id uuid,
 provider_key text,policy_status text,policy_verified_at timestamptz,policy_expires_at timestamptz);
CREATE TABLE melrah.healthcare_facility_requirement(id uuid PRIMARY KEY,
 tenant_id uuid,facility_id uuid,provider_key text,active boolean,required boolean);
CREATE TABLE melrah.healthcare_credential_evidence(requirement_id uuid,tenant_id uuid,
 facility_id uuid,provider_key text,technician_id uuid,status text,verified_by uuid,
 source_system text,external_reference text,verified_at timestamptz,expires_at timestamptz);
CREATE TABLE melrah.healthcare_access_exclusion(tenant_id uuid,facility_id uuid,
 technician_id uuid,active boolean,effective_at timestamptz);
CREATE TABLE melrah.healthcare_access_exception(id uuid PRIMARY KEY,requirement_id uuid);
CREATE FUNCTION core.member_of(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
-- Exception branch is out of scope; these functions are only signatures
-- needed to compile the real preflight, never called by this suite.
CREATE FUNCTION melrah.healthcare_exception_lock_for_dispatch(uuid)
 RETURNS melrah.healthcare_access_exception LANGUAGE sql AS
 'SELECT * FROM melrah.healthcare_access_exception WHERE false';
CREATE FUNCTION melrah.healthcare_exception_matches_visit(uuid,uuid,uuid,uuid,timestamptz)
 RETURNS boolean LANGUAGE sql AS 'SELECT false';
INSERT INTO melrah.account VALUES('00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000001');
INSERT INTO melrah.facility VALUES('00000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-000000000002');
INSERT INTO melrah.field_resource VALUES('00000000-0000-0000-0000-000000000004',true);
INSERT INTO melrah.work_order VALUES('00000000-0000-0000-0000-000000000005',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000003',
 (now() AT TIME ZONE 'UTC')::date+3,'HEALTHCARE_MDR','DRAFT',NULL);
INSERT INTO melrah.healthcare_facility_scope VALUES(
 '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
INSERT INTO melrah.healthcare_technician_tenant VALUES(
 '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004');
INSERT INTO melrah.healthcare_facility_credentialing VALUES(
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000003','SYMPLR','VERIFIED',
 now()-interval '2 days',now()+interval '30 days');
INSERT INTO melrah.healthcare_facility_requirement VALUES(
 '00000000-0000-0000-0000-000000000006',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000003','SYMPLR',true,true);
