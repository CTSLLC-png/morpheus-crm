-- CI-only fixture for concurrent hospital approval withdrawal.
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
