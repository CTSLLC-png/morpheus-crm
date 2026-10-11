-- Actual integrated preflight on real proposed MDR tables and real locking
-- helpers; only core.member_of and the production parent tables are fixtures.
BEGIN;
INSERT INTO melrah.healthcare_facility_scope(tenant_id,facility_id)
VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
INSERT INTO melrah.healthcare_technician_tenant(tenant_id,technician_id)
VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004');
INSERT INTO melrah.healthcare_facility_credentialing
(tenant_id,facility_id,provider_key,policy_status,policy_verified_at,policy_expires_at)
VALUES('00000000-0000-0000-0000-000000000001',
'00000000-0000-0000-0000-000000000003','SYMPLR','VERIFIED',
now()-interval '2 days',now()+interval '30 days');
INSERT INTO melrah.healthcare_facility_requirement
(id,tenant_id,facility_id,provider_key,requirement_key,description)
VALUES('00000000-0000-0000-0000-000000000006',
'00000000-0000-0000-0000-000000000001',
'00000000-0000-0000-0000-000000000003','SYMPLR','BADGE','Facility badge');
CREATE OR REPLACE FUNCTION pg_temp.expect_preflight(p_message text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_code text;actual_message text;
BEGIN
 BEGIN
  PERFORM melrah.healthcare_dispatch_preflight_disabled(
   '00000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000004');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS actual_code=RETURNED_SQLSTATE,actual_message=MESSAGE_TEXT;
 END;
 IF actual_code IS DISTINCT FROM '23514' OR actual_message IS DISTINCT FROM p_message
 THEN RAISE EXCEPTION 'Expected [%], got SQLSTATE [%] [%]',
  p_message,actual_code,actual_message;
 END IF;
 IF EXISTS(SELECT 1 FROM melrah.work_order
  WHERE id='00000000-0000-0000-0000-000000000005'
  AND (status<>'DRAFT' OR assigned_resource_id IS NOT NULL))
 THEN RAISE EXCEPTION 'Preflight mutated work order'; END IF;
END $$;
SELECT pg_temp.expect_preflight(
 'Healthcare evidence not eligible (exceptions cannot waive evidence yet)');
INSERT INTO melrah.healthcare_credential_evidence
(requirement_id,tenant_id,facility_id,provider_key,technician_id,status,
 verified_at,expires_at,verified_by,source_system,external_reference)
VALUES('00000000-0000-0000-0000-000000000006',
'00000000-0000-0000-0000-000000000001',
'00000000-0000-0000-0000-000000000003','SYMPLR',
'00000000-0000-0000-0000-000000000004','VERIFIED',
now()-interval '2 days',now()+interval '30 days',
'00000000-0000-0000-0000-000000000020','SYMPLR','badge-123');
SELECT pg_temp.expect_preflight(
 'Healthcare dispatch remains disabled: integrated preflight is non-authorizing');
INSERT INTO melrah.healthcare_access_exclusion
(tenant_id,facility_id,technician_id,reason_code,facility_reference,effective_at)
VALUES('00000000-0000-0000-0000-000000000001',
'00000000-0000-0000-0000-000000000003',
'00000000-0000-0000-0000-000000000004',
'CONDUCT_DISMISSAL','hospital-ban',now()-interval '1 hour');
SELECT pg_temp.expect_preflight(
 'Hospital facility access restriction blocks dispatch');
DELETE FROM melrah.healthcare_access_exclusion;
UPDATE melrah.healthcare_credential_evidence SET status='REVOKED';
SELECT pg_temp.expect_preflight(
 'Healthcare evidence not eligible (exceptions cannot waive evidence yet)');
DO $$ BEGIN RAISE NOTICE 'PASS: actual schema+locks+eligibility+disabled preflight'; END $$;
ROLLBACK;
