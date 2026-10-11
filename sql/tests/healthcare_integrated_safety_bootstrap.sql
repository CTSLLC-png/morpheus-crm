-- Minimal disposable schema for combined evidence + exclusion trigger test.
CREATE SCHEMA melrah;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE TABLE melrah.healthcare_credential_evidence (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,facility_id uuid NOT NULL,
 technician_id uuid NOT NULL,status text NOT NULL
);
CREATE TABLE melrah.healthcare_access_exclusion (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,facility_id uuid NOT NULL,technician_id uuid NOT NULL,
 reason_code text NOT NULL,active boolean NOT NULL DEFAULT true
);
INSERT INTO melrah.healthcare_credential_evidence VALUES
('00000000-0000-0000-0000-000000000004',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000003','VERIFIED');
