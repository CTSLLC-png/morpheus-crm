-- CI-only dependencies for actual credential evidence proposal.
CREATE SCHEMA core;
CREATE SCHEMA auth;
CREATE SCHEMA melrah;
CREATE TABLE core.tenant(id uuid PRIMARY KEY);
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE melrah.account(id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES core.tenant(id));
CREATE TABLE melrah.facility(id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES melrah.account(id));
CREATE TABLE melrah.field_resource(id uuid PRIMARY KEY,active boolean NOT NULL DEFAULT true);
CREATE TABLE melrah.work_order(id uuid PRIMARY KEY,tenant_id uuid,account_id uuid,facility_id uuid,
 scheduled_for date,program_key text);
CREATE TABLE melrah.healthcare_facility_scope(tenant_id uuid NOT NULL,facility_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,facility_id));
CREATE TABLE melrah.healthcare_technician_tenant(tenant_id uuid NOT NULL,technician_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,technician_id));
CREATE TABLE melrah.healthcare_facility_credentialing(
 tenant_id uuid NOT NULL,facility_id uuid NOT NULL,provider_key text NOT NULL,
 policy_status text NOT NULL,policy_verified_at timestamptz,policy_expires_at timestamptz,
 PRIMARY KEY(tenant_id,facility_id,provider_key));
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
