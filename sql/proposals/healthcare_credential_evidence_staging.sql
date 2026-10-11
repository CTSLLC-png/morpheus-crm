-- PROPOSAL ONLY: not deployed. Requires healthcare_credentialing_secure_staging.sql.
-- No client-side writes. Authorized server-side verification design still pending.
BEGIN;

CREATE TABLE IF NOT EXISTS melrah.healthcare_facility_requirement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  facility_id uuid NOT NULL,
  provider_key text NOT NULL,
  requirement_key text NOT NULL CHECK (length(trim(requirement_key)) > 0),
  description text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, facility_id, requirement_key),
  UNIQUE (id, tenant_id, facility_id, provider_key),
  FOREIGN KEY (tenant_id, facility_id, provider_key)
    REFERENCES melrah.healthcare_facility_credentialing(tenant_id, facility_id, provider_key)
);

CREATE TABLE IF NOT EXISTS melrah.healthcare_credential_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  facility_id uuid NOT NULL,
  provider_key text NOT NULL,
  technician_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','VERIFIED','REVOKED','EXPIRED','REJECTED')),
  verified_at timestamptz,
  expires_at timestamptz,
  verified_by uuid REFERENCES auth.users(id),
  source_system text,
  external_reference text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (requirement_id, tenant_id, facility_id, provider_key)
    REFERENCES melrah.healthcare_facility_requirement(id, tenant_id, facility_id, provider_key),
  FOREIGN KEY (tenant_id, technician_id)
    REFERENCES melrah.healthcare_technician_tenant(tenant_id, technician_id),
  FOREIGN KEY (tenant_id, facility_id, provider_key)
    REFERENCES melrah.healthcare_facility_credentialing(tenant_id, facility_id, provider_key),
  CONSTRAINT verified_evidence_complete CHECK (
    status <> 'VERIFIED' OR (
      verified_at IS NOT NULL AND expires_at IS NOT NULL
      AND expires_at > verified_at AND verified_by IS NOT NULL
      AND source_system IS NOT NULL AND length(trim(source_system)) > 0
      AND external_reference IS NOT NULL AND length(trim(external_reference)) > 0
    )
  )
);

CREATE INDEX IF NOT EXISTS healthcare_evidence_lookup_idx
  ON melrah.healthcare_credential_evidence
  (tenant_id, facility_id, technician_id, requirement_id, status, expires_at);

ALTER TABLE melrah.healthcare_facility_requirement ENABLE ROW LEVEL SECURITY;
ALTER TABLE melrah.healthcare_credential_evidence ENABLE ROW LEVEL SECURITY;

-- Intentionally no client-facing policies or grants: deny-by-default.
REVOKE ALL ON melrah.healthcare_facility_requirement FROM PUBLIC, anon, authenticated;
REVOKE ALL ON melrah.healthcare_credential_evidence FROM PUBLIC, anon, authenticated;

COMMIT;

-- NOT READY FOR DEPLOYMENT:
-- 1. Verify grant inheritance, schema exposure, ownership and RLS behavior.
-- 2. Add authenticated, auditable verifier ingestion with source provenance.
-- 3. Resolve how revoked/duplicate/conflicting evidence is represented.
-- 4. Define facility-local service-date expiry and policy effective dates.
-- 5. Add atomic server dispatch eligibility check and revocation race tests.
-- 6. Run complete migration in disposable full-schema staging before Supabase.
