-- Disposable adapter for exact existing public assignment RPC and proposed guard.
-- Parent fixture is deliberately not a production schema migration.
ALTER TABLE melrah.work_order ADD COLUMN wo_number text;
ALTER TABLE melrah.work_order ADD COLUMN updated_at timestamptz DEFAULT now();
ALTER TABLE melrah.work_order ADD COLUMN assigned_to uuid;
ALTER TABLE melrah.work_order ADD COLUMN dispatched_at timestamptz;
ALTER TABLE melrah.work_order ADD COLUMN en_route_at timestamptz;
ALTER TABLE melrah.work_order ADD COLUMN arrived_at timestamptz;
ALTER TABLE melrah.work_order ADD COLUMN collection_started_at timestamptz;
ALTER TABLE melrah.work_order ADD COLUMN completed_at timestamptz;
ALTER TABLE melrah.work_order ADD COLUMN closed_at timestamptz;
CREATE TABLE melrah.service_appointment(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 work_order_id uuid NOT NULL REFERENCES melrah.work_order(id),
 resource_id uuid,status text,scheduled_start timestamptz,
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE FUNCTION core.tenant_id(text) RETURNS uuid LANGUAGE sql STABLE
 AS $$SELECT '00000000-0000-0000-0000-000000000001'::uuid$$;
