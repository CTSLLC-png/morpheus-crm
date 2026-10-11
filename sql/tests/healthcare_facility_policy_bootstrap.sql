-- CI-only fixture: minimal tables sharing tenant/facility columns.
CREATE SCHEMA melrah;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE TABLE melrah.healthcare_facility_credentialing (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,facility_id uuid NOT NULL,
 policy_status text NOT NULL);
CREATE TABLE melrah.healthcare_facility_requirement (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,facility_id uuid NOT NULL,
 active boolean NOT NULL);
CREATE TABLE melrah.healthcare_facility_approver (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,facility_id uuid NOT NULL,
 active boolean NOT NULL);
INSERT INTO melrah.healthcare_facility_credentialing VALUES (
 '00000000-0000-0000-0000-000000000004',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002','VERIFIED');
INSERT INTO melrah.healthcare_facility_requirement VALUES (
 '00000000-0000-0000-0000-000000000005',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',true);
INSERT INTO melrah.healthcare_facility_approver VALUES (
 '00000000-0000-0000-0000-000000000006',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',true);
