-- Run after disposable bootstrap and evidence schema proposal; never production.
BEGIN;
INSERT INTO core.tenant VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000010');
INSERT INTO melrah.facility VALUES ('00000000-0000-0000-0000-000000000011'),('00000000-0000-0000-0000-000000000012');
INSERT INTO melrah.field_resource VALUES ('00000000-0000-0000-0000-000000000021');
INSERT INTO melrah.healthcare_facility_scope VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012');
INSERT INTO melrah.healthcare_technician_tenant VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021');
INSERT INTO melrah.healthcare_facility_credentialing VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','SYMPLR'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012','GHX_VENDOR_MATE');
INSERT INTO melrah.healthcare_facility_requirement
 (id,tenant_id,facility_id,provider_key,requirement_key,description)
VALUES ('00000000-0000-0000-0000-000000000031',
 '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011',
 'SYMPLR','hospital_badge','Hospital badge');
DO $test$
DECLARE blocked boolean;
BEGIN
 -- Valid evidence accepted.
 INSERT INTO melrah.healthcare_credential_evidence
 (requirement_id,tenant_id,facility_id,provider_key,technician_id,status,
  verified_at,expires_at,verified_by,source_system,external_reference)
 VALUES ('00000000-0000-0000-0000-000000000031',
 '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011',
 'SYMPLR','00000000-0000-0000-0000-000000000021','VERIFIED',
 now(),now()+interval '30 days','00000000-0000-0000-0000-000000000010','fixture','ref-1');

 blocked:=false;
 BEGIN
 INSERT INTO melrah.healthcare_credential_evidence
 (requirement_id,tenant_id,facility_id,provider_key,technician_id)
 VALUES ('00000000-0000-0000-0000-000000000031',
 '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012',
 'GHX_VENDOR_MATE','00000000-0000-0000-0000-000000000021');
 EXCEPTION WHEN foreign_key_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL cross-tenant evidence accepted'; END IF;

 blocked:=false;
 BEGIN
 INSERT INTO melrah.healthcare_credential_evidence
 (requirement_id,tenant_id,facility_id,provider_key,technician_id)
 VALUES ('00000000-0000-0000-0000-000000000031',
 '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011',
 'GHX_VENDOR_MATE','00000000-0000-0000-0000-000000000021');
 EXCEPTION WHEN foreign_key_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL wrong-provider evidence accepted'; END IF;

 blocked:=false;
 BEGIN
 INSERT INTO melrah.healthcare_credential_evidence
 (requirement_id,tenant_id,facility_id,provider_key,technician_id,status)
 VALUES ('00000000-0000-0000-0000-000000000031',
 '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011',
 'SYMPLR','00000000-0000-0000-0000-000000000021','VERIFIED');
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL unverifiable VERIFIED evidence accepted'; END IF;

 RAISE NOTICE 'PASS: valid evidence, cross-tenant denial, wrong-provider denial, incomplete verification denial';
END $test$;
ROLLBACK;
