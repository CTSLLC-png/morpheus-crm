-- CI-only parent fixture. Not representative of full production authorization.
CREATE SCHEMA core;
CREATE SCHEMA auth;
CREATE SCHEMA melrah;
CREATE TABLE melrah.healthcare_facility_scope (
 tenant_id uuid NOT NULL, facility_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,facility_id));
CREATE TABLE melrah.healthcare_technician_tenant (
 tenant_id uuid NOT NULL, technician_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,technician_id));
CREATE TABLE melrah.healthcare_facility_credentialing (
 tenant_id uuid NOT NULL,facility_id uuid NOT NULL,provider_key text NOT NULL,
 PRIMARY KEY(tenant_id,facility_id,provider_key));
CREATE TABLE melrah.healthcare_facility_requirement (
 id uuid NOT NULL,tenant_id uuid NOT NULL,facility_id uuid NOT NULL,provider_key text NOT NULL,
 PRIMARY KEY(id),UNIQUE(id,tenant_id,facility_id,provider_key));
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
