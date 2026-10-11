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
 '00000000-0000-0000-0000-000000000003',
 'SYMPLR','BADGE','Facility badge');
DO $$ BEGIN
 IF melrah.healthcare_evidence_eligible(
 '00000000-0000-0000-0000-000000000005',
 '00000000-0000-0000-0000-000000000004')
 THEN RAISE EXCEPTION 'Missing credential evidence was accepted'; END IF;
END $$;
INSERT INTO melrah.healthcare_credential_evidence
 (requirement_id,tenant_id,facility_id,provider_key,technician_id,status,
 verified_at,expires_at,verified_by,source_system,external_reference)
 VALUES('00000000-0000-0000-0000-000000000006',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000003',
 'SYMPLR','00000000-0000-0000-0000-000000000004','VERIFIED',
 now()-interval '2 days',now()+interval '30 days',
 '00000000-0000-0000-0000-000000000020','SYMPLR','test-badge');
DO $$ BEGIN
 IF NOT melrah.healthcare_evidence_eligible(
 '00000000-0000-0000-0000-000000000005',
 '00000000-0000-0000-0000-000000000004')
 THEN RAISE EXCEPTION 'Valid credential evidence was rejected'; END IF;
END $$;
UPDATE melrah.healthcare_credential_evidence SET status='REVOKED';
DO $$ BEGIN
 IF melrah.healthcare_evidence_eligible(
 '00000000-0000-0000-0000-000000000005',
 '00000000-0000-0000-0000-000000000004')
 THEN RAISE EXCEPTION 'Revoked credential evidence was accepted'; END IF;
 RAISE NOTICE 'PASS: real MDR schema loaded, missing/verified/revoked eligibility';
END $$;
ROLLBACK;
