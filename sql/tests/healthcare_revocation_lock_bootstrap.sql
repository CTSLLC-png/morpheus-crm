-- Disposable PostgreSQL fixture for revocation lock contract.
CREATE SCHEMA melrah;
CREATE TABLE melrah.healthcare_credential_evidence (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL,facility_id uuid NOT NULL,
 technician_id uuid NOT NULL,status text NOT NULL
);
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
INSERT INTO melrah.healthcare_credential_evidence VALUES (
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-000000000004','VERIFIED');
