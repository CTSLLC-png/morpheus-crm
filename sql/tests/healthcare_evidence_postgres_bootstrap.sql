-- Disposable PostgreSQL fixture for healthcare evidence schema. Not a production schema.
CREATE SCHEMA core;
CREATE SCHEMA auth;
CREATE SCHEMA melrah;
CREATE TABLE core.tenant(id uuid PRIMARY KEY);
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE melrah.facility(id uuid PRIMARY KEY);
CREATE TABLE melrah.field_resource(id uuid PRIMARY KEY);
CREATE TABLE melrah.healthcare_facility_scope(
 tenant_id uuid NOT NULL REFERENCES core.tenant(id),
 facility_id uuid NOT NULL REFERENCES melrah.facility(id),
 PRIMARY KEY(tenant_id,facility_id)
);
CREATE TABLE melrah.healthcare_technician_tenant(
 tenant_id uuid NOT NULL REFERENCES core.tenant(id),
 technician_id uuid NOT NULL REFERENCES melrah.field_resource(id),
 PRIMARY KEY(tenant_id,technician_id)
);
CREATE TABLE melrah.healthcare_facility_credentialing(
 tenant_id uuid NOT NULL,
 facility_id uuid NOT NULL,
 provider_key text NOT NULL,
 PRIMARY KEY(tenant_id,facility_id,provider_key),
 FOREIGN KEY(tenant_id,facility_id)
  REFERENCES melrah.healthcare_facility_scope(tenant_id,facility_id)
);
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
