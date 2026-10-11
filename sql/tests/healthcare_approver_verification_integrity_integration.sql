BEGIN;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000020');
INSERT INTO melrah.healthcare_facility_scope VALUES
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
INSERT INTO melrah.healthcare_facility_approver
(tenant_id,facility_id,approver_id,authority_reference,active,valid_from,valid_until)
VALUES('00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000009','hospital-directory',true,
 now()-interval '2 days',now()+interval '2 days');
INSERT INTO melrah.healthcare_facility_approver_verification
(id,tenant_id,facility_id,approver_id,verification_status,verification_method,
 verification_reference,verified_by,verified_at,valid_until)
VALUES('00000000-0000-0000-0000-000000000030',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000009','VERIFIED',
 'HOSPITAL_DIRECTORY_CALLBACK','ticket-123',
 '00000000-0000-0000-0000-000000000020',now()-interval '1 hour',
 now()+interval '1 day');
CREATE OR REPLACE FUNCTION pg_temp.assert_rejected(statement text,expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE state text;message text;
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
 END;
 IF state IS DISTINCT FROM '23514' OR message IS DISTINCT FROM expected THEN
  RAISE EXCEPTION 'Expected [%], got [%] %',expected,state,message;
 END IF;
END $$;
SELECT pg_temp.assert_rejected(
 $$UPDATE melrah.healthcare_facility_approver_verification SET verification_reference='forged'$$,
 'Hospital approver verification provenance is immutable');
SELECT pg_temp.assert_rejected(
 $$DELETE FROM melrah.healthcare_facility_approver_verification$$,
 'Hospital approver verification records cannot be deleted');
SELECT pg_temp.assert_rejected(
 $$UPDATE melrah.healthcare_facility_approver_verification SET verification_status='PENDING'$$,
 'Hospital approver verification status cannot be rewritten');
UPDATE melrah.healthcare_facility_approver_verification
 SET verification_status='REVOKED',revoked_at=now();
SELECT pg_temp.assert_rejected(
 $$UPDATE melrah.healthcare_facility_approver_verification SET verification_status='VERIFIED',revoked_at=NULL$$,
 'Hospital approver verification status cannot be rewritten');
SELECT pg_temp.assert_rejected(
 $$UPDATE melrah.healthcare_facility_approver_verification SET revoked_at=NULL$$,
 'Hospital approver verification status cannot be rewritten');
DO $$ BEGIN RAISE NOTICE 'PASS: verification sealed, revocation one-way, no deletion'; END $$;
ROLLBACK;
