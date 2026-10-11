BEGIN;
INSERT INTO melrah.healthcare_facility_scope VALUES
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
INSERT INTO melrah.healthcare_technician_tenant VALUES
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
INSERT INTO melrah.healthcare_facility_credentialing VALUES
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','SYMPLR');
INSERT INTO melrah.healthcare_facility_requirement VALUES
('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002','SYMPLR');
INSERT INTO melrah.healthcare_access_exception
(id,tenant_id,account_id,facility_id,work_order_id,technician_id,requirement_id,
 provider_key,reason_code,melrah_requestor_id)
VALUES
('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-000000000004','SYMPLR','RENEWAL_PENDING',
 '00000000-0000-0000-0000-000000000008');
DO $test$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  UPDATE melrah.healthcare_access_exception SET decision='APPROVED'
  WHERE id='00000000-0000-0000-0000-000000000005';
 EXCEPTION WHEN check_violation THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL unproven approval accepted'; END IF;
END $test$;
UPDATE melrah.healthcare_access_exception SET
 decision='APPROVED',
 facility_approver_id='00000000-0000-0000-0000-000000000009',
 facility_authorization_ref='facility-written-approval',
 facility_approved_at='2026-11-01T12:00:00Z',
 melrah_reviewer_id='00000000-0000-0000-0000-000000000010',
 melrah_reviewed_at='2026-11-01T12:05:00Z',
 expires_at='2026-11-02T12:00:00Z'
WHERE id='00000000-0000-0000-0000-000000000005';
INSERT INTO melrah.healthcare_access_exception_event(exception_id,event_type)
VALUES ('00000000-0000-0000-0000-000000000005','FACILITY_APPROVED');
DO $test$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  DELETE FROM melrah.healthcare_access_exception_event
  WHERE exception_id='00000000-0000-0000-0000-000000000005';
 EXCEPTION WHEN check_violation THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL audit deletion accepted'; END IF;
 IF has_table_privilege('authenticated','melrah.healthcare_access_exception','INSERT')
 THEN RAISE EXCEPTION 'FAIL client can create override'; END IF;
 RAISE NOTICE 'PASS incomplete approval rejected; complete provenance stored; audit deletion denied; client writes denied';
END $test$;
ROLLBACK;
