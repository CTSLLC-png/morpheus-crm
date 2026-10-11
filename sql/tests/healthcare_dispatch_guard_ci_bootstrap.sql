-- Disposable CI database only. Minimum schema needed to install the proposed guard.
CREATE SCHEMA IF NOT EXISTS melrah;
CREATE TABLE melrah.work_order (
  id uuid PRIMARY KEY,
  program_key text NOT NULL,
  status text NOT NULL,
  assigned_resource_id uuid,
  dispatched_at timestamptz,
  en_route_at timestamptz,
  completed_at timestamptz,
  arrived_at timestamptz,
  collection_started_at timestamptz,
  closed_at timestamptz,
  assigned_to uuid
);
