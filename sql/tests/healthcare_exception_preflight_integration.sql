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
INSERT INTO melrah.work_order VALUES
('00000000-0000-0000-0000-000000000007',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000006',
 '00000000-0000-0000-0000-000000000002','HEALTHCARE_MDR','DRAFT',NULL);
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
VALUES('00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000009',
 'hospital-onboarding',true,now()-interval '1 day',now()+interval '1 day');
CREATE OR REPLACE FUNCTION pg_temp.expect_preflight(p_message text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE code text;msg text;before_row jsonb;after_row jsonb;
BEGIN
 SELECT to_jsonb(w) INTO before_row FROM melrah.work_order w;
 BEGIN
  PERFORM melrah.healthcare_dispatch_preflight_disabled(
   '00000000-0000-0000-0000-000000000007',
   '00000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000005');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,msg=MESSAGE_TEXT;
 END;
 IF code IS DISTINCT FROM '23514' OR msg IS DISTINCT FROM p_message THEN
  RAISE EXCEPTION 'Unexpected preflight outcome [%] %, expected %',code,msg,p_message;
 END IF;
 SELECT to_jsonb(w) INTO after_row FROM melrah.work_order w;
 IF before_row IS DISTINCT FROM after_row THEN
  RAISE EXCEPTION 'Preflight mutated work order';
 END IF;
END $$;
SELECT pg_temp.expect_preflight(
 'Healthcare dispatch remains disabled: integrated preflight is non-authorizing');
-- Conduct-related dismissal must trump an otherwise approved exception.
INSERT INTO melrah.healthcare_access_exclusion
(tenant_id,facility_id,technician_id,reason_code,facility_reference,effective_at)
VALUES('00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003',
 'CONDUCT_DISMISSAL','hospital-dismissal',now()-interval '1 minute');
SELECT pg_temp.expect_preflight('Hospital facility access restriction blocks dispatch');
DELETE FROM melrah.healthcare_access_exclusion;
-- Hospital withdraws authorization. Row-lock helper must deny.
UPDATE melrah.healthcare_access_exception SET decision='WITHDRAWN'
WHERE id='00000000-0000-0000-0000-000000000005';
SELECT pg_temp.expect_preflight('Hospital exception unavailable for dispatch');
DO $$ BEGIN RAISE NOTICE 'PASS: actual exception scope/authority/withdrawal functions integrated with preflight'; END $$;
ROLLBACK;
