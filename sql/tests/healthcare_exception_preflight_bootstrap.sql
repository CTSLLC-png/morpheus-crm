-- CI-only: run actual exception staging/authority/visit/withdrawal functions
-- alongside the real integrated disabled preflight. Other dependencies are
-- minimal fixtures and deterministic doubles, not a production migration.
CREATE SCHEMA core;
CREATE SCHEMA auth;
CREATE SCHEMA melrah;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE TABLE melrah.healthcare_facility_scope(
 tenant_id uuid NOT NULL,facility_id uuid NOT NULL,PRIMARY KEY(tenant_id,facility_id));
CREATE TABLE melrah.healthcare_technician_tenant(
 tenant_id uuid NOT NULL,technician_id uuid NOT NULL,PRIMARY KEY(tenant_id,technician_id));
CREATE TABLE melrah.healthcare_facility_credentialing(
 tenant_id uuid NOT NULL,facility_id uuid NOT NULL,provider_key text NOT NULL,
 PRIMARY KEY(tenant_id,facility_id,provider_key));
CREATE TABLE melrah.healthcare_facility_requirement(
 id uuid NOT NULL,tenant_id uuid NOT NULL,facility_id uuid NOT NULL,provider_key text NOT NULL,
 PRIMARY KEY(id),UNIQUE(id,tenant_id,facility_id,provider_key));
CREATE TABLE melrah.work_order(
 id uuid PRIMARY KEY,tenant_id uuid,account_id uuid,facility_id uuid,
 program_key text,status text,assigned_resource_id uuid);
CREATE FUNCTION core.member_of(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION melrah.healthcare_lock_facility_policy(uuid,uuid)
 RETURNS void LANGUAGE sql AS 'SELECT';
CREATE FUNCTION melrah.healthcare_lock_dispatch_safety_scope(uuid,uuid,uuid)
 RETURNS void LANGUAGE sql AS 'SELECT';
CREATE FUNCTION melrah.healthcare_evidence_eligible(uuid,uuid)
 RETURNS boolean LANGUAGE sql AS 'SELECT true';
