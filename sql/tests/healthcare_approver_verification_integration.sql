BEGIN;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000020');
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
 provider_key,reason_code,melrah_requestor_id,decision,facility_approver_id,
 facility_authorization_ref,facility_approved_at,melrah_reviewer_id,
 melrah_reviewed_at,expires_at)
VALUES('00000000-0000-0000-0000-000000000005',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000006',
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000007',
 '00000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-000000000004','SYMPLR','RENEWAL_PENDING',
 '00000000-0000-0000-0000-000000000008','APPROVED',
 '00000000-0000-0000-0000-000000000009','hospital-approval',
 now()-interval '1 hour','00000000-0000-0000-0000-000000000010',
 now()-interval '30 minutes',now()+interval '1 day');
INSERT INTO melrah.healthcare_facility_approver
(tenant_id,facility_id,approver_id,authority_reference,active,valid_from,valid_until)
VALUES('00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000009',
 'hospital-directory',true,now()-interval '2 days',now()+interval '2 days');
DO $$ BEGIN
 IF melrah.healthcare_exception_authority_valid('00000000-0000-0000-0000-000000000005')
 THEN RAISE EXCEPTION 'Unverified hospital approver was accepted'; END IF;
END $$;
INSERT INTO melrah.healthcare_facility_approver_verification
(tenant_id,facility_id,approver_id,verification_status,verification_method,
 verification_reference,verified_by,verified_at,valid_until)
VALUES('00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000009','VERIFIED',
 'HOSPITAL_DIRECTORY_CALLBACK','callback-ticket',
 '00000000-0000-0000-0000-000000000020',now()-interval '2 hours',
 now()+interval '1 day');
DO $$ BEGIN
 IF NOT melrah.healthcare_exception_authority_valid('00000000-0000-0000-0000-000000000005')
 THEN RAISE EXCEPTION 'Provenance-backed hospital approver rejected'; END IF;
END $$;
UPDATE melrah.healthcare_facility_approver_verification
 SET verification_status='REVOKED',revoked_at=now();
DO $$ BEGIN
 IF melrah.healthcare_exception_authority_valid('00000000-0000-0000-0000-000000000005')
 THEN RAISE EXCEPTION 'Revoked hospital approver was accepted'; END IF;
 RAISE NOTICE 'PASS: unverified denied, provenance verified accepted, revoked denied';
END $$;
ROLLBACK;
