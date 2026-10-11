BEGIN;
CREATE TABLE melrah.work_order (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,account_id uuid NOT NULL,
 facility_id uuid NOT NULL,program_key text NOT NULL
);
INSERT INTO melrah.healthcare_facility_scope VALUES
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
INSERT INTO melrah.healthcare_technician_tenant VALUES
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
INSERT INTO melrah.healthcare_facility_credentialing VALUES
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','SYMPLR');
INSERT INTO melrah.healthcare_facility_requirement VALUES
('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002','SYMPLR');
INSERT INTO melrah.work_order VALUES
('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002','HEALTHCARE_MDR'),
('00000000-0000-0000-0000-000000000017','00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002','HEALTHCARE_MDR');
INSERT INTO melrah.healthcare_access_exception
(id,tenant_id,account_id,facility_id,work_order_id,technician_id,requirement_id,
 provider_key,reason_code,melrah_requestor_id,decision,facility_approver_id,
 facility_authorization_ref,facility_approved_at,melrah_reviewer_id,
 melrah_reviewed_at,expires_at)
VALUES
('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-000000000004','SYMPLR','RENEWAL_PENDING',
 '00000000-0000-0000-0000-000000000008','APPROVED',
 '00000000-0000-0000-0000-000000000009','facility-approval',
 now()-interval '1 hour','00000000-0000-0000-0000-000000000010',
 now()-interval '30 minutes',now()+interval '1 day');
INSERT INTO melrah.healthcare_facility_approver
(tenant_id,facility_id,approver_id,authority_reference,active,valid_from,valid_until)
VALUES ('00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000009',
 'verified-hospital-authority',true,now()-interval '1 day',now()+interval '1 day');
DO $test$
DECLARE eid uuid:='00000000-0000-0000-0000-000000000005';
DECLARE wid uuid:='00000000-0000-0000-0000-000000000007';
DECLARE tid uuid:='00000000-0000-0000-0000-000000000003';
DECLARE rid uuid:='00000000-0000-0000-0000-000000000004';
BEGIN
 IF NOT melrah.healthcare_exception_matches_visit(eid,wid,tid,rid)
 THEN RAISE EXCEPTION 'FAIL exact visit denied'; END IF;
 IF melrah.healthcare_exception_matches_visit(eid,
  '00000000-0000-0000-0000-000000000017',tid,rid)
 THEN RAISE EXCEPTION 'FAIL reused for another visit'; END IF;
 IF melrah.healthcare_exception_matches_visit(eid,wid,
  '00000000-0000-0000-0000-000000000013',rid)
 THEN RAISE EXCEPTION 'FAIL wrong technician accepted'; END IF;
 IF melrah.healthcare_exception_matches_visit(eid,wid,tid,
  '00000000-0000-0000-0000-000000000014')
 THEN RAISE EXCEPTION 'FAIL wrong requirement accepted'; END IF;
END $test$;
UPDATE melrah.work_order SET account_id='00000000-0000-0000-0000-000000000016'
WHERE id='00000000-0000-0000-0000-000000000007';
DO $test$
BEGIN
 IF melrah.healthcare_exception_matches_visit(
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000007',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004')
 THEN RAISE EXCEPTION 'FAIL account mismatch accepted'; END IF;
 RAISE NOTICE 'PASS exact visit, other visit, technician, requirement and account scope';
END $test$;
ROLLBACK;
