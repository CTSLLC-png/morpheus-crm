BEGIN;
INSERT INTO melrah.healthcare_facility_scope VALUES
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
INSERT INTO melrah.healthcare_technician_tenant VALUES
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
INSERT INTO melrah.healthcare_facility_credentialing VALUES
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','SYMPLR');
INSERT INTO melrah.healthcare_facility_requirement VALUES
('00000000-0000-0000-0000-000000000004',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002','SYMPLR');
INSERT INTO melrah.healthcare_access_exception
(id,tenant_id,account_id,facility_id,work_order_id,technician_id,requirement_id,
 provider_key,reason_code,melrah_requestor_id)
VALUES('00000000-0000-0000-0000-000000000005',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000006',
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000007',
 '00000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-000000000004','SYMPLR','RENEWAL_PENDING',
 '00000000-0000-0000-0000-000000000008');
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
 $$UPDATE melrah.healthcare_access_exception SET technician_id='00000000-0000-0000-0000-000000000099'$$,
 'Healthcare exception scope is immutable');
SELECT pg_temp.assert_rejected(
 $$UPDATE melrah.healthcare_access_exception SET work_order_id='00000000-0000-0000-0000-000000000099'$$,
 'Healthcare exception scope is immutable');
SELECT pg_temp.assert_rejected(
 $$DELETE FROM melrah.healthcare_access_exception$$,
 'Healthcare exceptions cannot be deleted');
UPDATE melrah.healthcare_access_exception SET decision='APPROVED',
 facility_approver_id='00000000-0000-0000-0000-000000000009',
 facility_authorization_ref='hospital-record',
 facility_approved_at=now()-interval '1 hour',
 melrah_reviewer_id='00000000-0000-0000-0000-000000000010',
 melrah_reviewed_at=now()-interval '30 minutes',
 expires_at=now()+interval '1 day';
SELECT pg_temp.assert_rejected(
 $$UPDATE melrah.healthcare_access_exception SET facility_authorization_ref='replaced'$$,
 'Approved healthcare exception provenance is immutable');
UPDATE melrah.healthcare_access_exception SET used_at=now();
SELECT pg_temp.assert_rejected(
 $$UPDATE melrah.healthcare_access_exception SET used_at=NULL$$,
 'Consumed healthcare exception cannot be reused');
INSERT INTO melrah.healthcare_access_exception (id,tenant_id,account_id,facility_id,work_order_id,technician_id,requirement_id,provider_key,reason_code,melrah_requestor_id) VALUES ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','SYMPLR','RENEWAL_PENDING','00000000-0000-0000-0000-000000000008');
SELECT pg_temp.assert_rejected($$UPDATE melrah.healthcare_access_exception SET decision='WITHDRAWN' WHERE id='00000000-0000-0000-0000-000000000005'$$,'Only approved healthcare exceptions can be consumed');
UPDATE melrah.healthcare_access_exception SET decision='WITHDRAWN' WHERE id='00000000-0000-0000-0000-000000000011';
SELECT pg_temp.assert_rejected($$UPDATE melrah.healthcare_access_exception SET decision='APPROVED' WHERE id='00000000-0000-0000-0000-000000000011'$$,'Healthcare exception terminal decision cannot change');
DO $$ BEGIN RAISE NOTICE 'PASS: scope immutable, approval provenance sealed, consumption one-way, withdrawal terminal'; END $$;
ROLLBACK;
