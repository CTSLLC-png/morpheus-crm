-- Disposable PostgreSQL integration fixture for real status RPC plus MDR trigger.
-- Never run against production. All test objects are ephemeral CI objects.
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS melrah;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE melrah.work_order (
 id uuid PRIMARY KEY,
 wo_number text NOT NULL,
 program_key text NOT NULL,
 status text NOT NULL,
 assigned_resource_id uuid,
 assigned_to uuid,
 dispatched_at timestamptz,
 en_route_at timestamptz,
 arrived_at timestamptz,
 collection_started_at timestamptz,
 completed_at timestamptz,
 closed_at timestamptz,
 cancelled_at timestamptz,
 dispatch_notes text
);
CREATE TABLE melrah.service_appointment (
 work_order_id uuid NOT NULL REFERENCES melrah.work_order(id),
 status text NOT NULL,
 updated_at timestamptz
);
CREATE OR REPLACE FUNCTION core.tenant_id(p_slug text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT '00000000-0000-0000-0000-000000000001'::uuid
$$;
CREATE OR REPLACE FUNCTION core.member_of(p_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT true
$$;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
