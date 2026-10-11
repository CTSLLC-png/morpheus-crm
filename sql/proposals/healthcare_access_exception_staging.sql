-- PROPOSAL ONLY. Not deployed. No automatic dispatch authorization.
-- Facility-approved administrative exception, immutable scope, append-only events.
-- Hospital authority must be independently authenticated before approval ingestion.
BEGIN;
CREATE TABLE IF NOT EXISTS melrah.healthcare_access_exception (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 account_id uuid NOT NULL,
 facility_id uuid NOT NULL,
 work_order_id uuid NOT NULL,
 technician_id uuid NOT NULL,
 requirement_id uuid NOT NULL,
 provider_key text NOT NULL,
 reason_code text NOT NULL CHECK (reason_code IN
   ('ADMIN_DOCUMENT','RENEWAL_PENDING','PROVIDER_SYNC','OTHER_APPROVED')),
 decision text NOT NULL DEFAULT 'REQUESTED' CHECK (decision IN
   ('REQUESTED','APPROVED','DENIED','WITHDRAWN','EXPIRED')),
 facility_approver_id uuid,
 facility_authorization_ref text,
 facility_approved_at timestamptz,
 melrah_requestor_id uuid NOT NULL,
 melrah_reviewer_id uuid,
 melrah_reviewed_at timestamptz,
 expires_at timestamptz,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,facility_id,provider_key)
   REFERENCES melrah.healthcare_facility_credentialing(tenant_id,facility_id,provider_key),
 FOREIGN KEY (requirement_id,tenant_id,facility_id,provider_key)
   REFERENCES melrah.healthcare_facility_requirement(id,tenant_id,facility_id,provider_key),
 FOREIGN KEY (tenant_id,technician_id)
   REFERENCES melrah.healthcare_technician_tenant(tenant_id,technician_id),
 CONSTRAINT exception_approved_provenance CHECK (
  decision <> 'APPROVED' OR
   (facility_approver_id IS NOT NULL
    AND nullif(trim(facility_authorization_ref),'') IS NOT NULL
    AND facility_approved_at IS NOT NULL
    AND melrah_reviewer_id IS NOT NULL
    AND melrah_reviewer_id <> melrah_requestor_id
    AND melrah_reviewed_at IS NOT NULL
    AND expires_at IS NOT NULL
    AND expires_at > facility_approved_at)
 )
);
CREATE INDEX IF NOT EXISTS healthcare_exception_visit_idx
 ON melrah.healthcare_access_exception(tenant_id,facility_id,work_order_id,technician_id,decision,expires_at);
CREATE TABLE IF NOT EXISTS melrah.healthcare_access_exclusion (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 facility_id uuid NOT NULL,
 technician_id uuid NOT NULL,
 reason_code text NOT NULL CHECK (reason_code IN
  ('CONDUCT_DISMISSAL','FACILITY_BAN','SECURITY_RESTRICTION','SAFETY_RESTRICTION','LEGAL_PROHIBITION')),
 active boolean NOT NULL DEFAULT true,
 facility_reference text NOT NULL CHECK (length(trim(facility_reference)) > 0),
 effective_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,facility_id) REFERENCES melrah.healthcare_facility_scope(tenant_id,facility_id),
 FOREIGN KEY (tenant_id,technician_id) REFERENCES melrah.healthcare_technician_tenant(tenant_id,technician_id)
);
CREATE INDEX IF NOT EXISTS healthcare_exclusion_lookup_idx
 ON melrah.healthcare_access_exclusion(tenant_id,facility_id,technician_id,active);
CREATE TABLE IF NOT EXISTS melrah.healthcare_access_exception_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 exception_id uuid NOT NULL REFERENCES melrah.healthcare_access_exception(id),
 event_type text NOT NULL CHECK (event_type IN
  ('REQUESTED','FACILITY_APPROVED','MELRAH_REVIEWED','DENIED','WITHDRAWN','EXPIRED','USED')),
 actor_id uuid,
 source_reference text,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE OR REPLACE FUNCTION melrah.healthcare_exception_event_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,melrah AS $body$
BEGIN
 RAISE EXCEPTION 'Healthcare exception audit events are append-only'
 USING ERRCODE='23514';
END $body$;
DROP TRIGGER IF EXISTS healthcare_exception_event_immutable ON melrah.healthcare_access_exception_event;
CREATE TRIGGER healthcare_exception_event_immutable
BEFORE UPDATE OR DELETE ON melrah.healthcare_access_exception_event
FOR EACH ROW EXECUTE FUNCTION melrah.healthcare_exception_event_immutable();
ALTER TABLE melrah.healthcare_access_exception ENABLE ROW LEVEL SECURITY;
ALTER TABLE melrah.healthcare_access_exclusion ENABLE ROW LEVEL SECURITY;
ALTER TABLE melrah.healthcare_access_exception_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON melrah.healthcare_access_exception FROM PUBLIC,anon,authenticated;
REVOKE ALL ON melrah.healthcare_access_exclusion FROM PUBLIC,anon,authenticated;
REVOKE ALL ON melrah.healthcare_access_exception_event FROM PUBLIC,anon,authenticated;
COMMIT;
-- OPEN GATES: add tenant/account/work-order composite FKs; trusted facility
-- approver roster and verification; immutable scope and state transitions;
-- exclusion precedence in authorization; withdrawal locking; secure audited
-- ingestion; legal non-waivable requirement classification; full RLS/privilege
-- tests. A row marked APPROVED does NOT itself authorize dispatch.
