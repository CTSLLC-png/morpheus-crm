-- PROPOSAL ONLY: verified hospital authority requires independently
-- recorded provenance. No automatic identity verification or dispatch unlock.
-- Verification records MUST originate from trusted, authenticated onboarding.
BEGIN;
CREATE TABLE IF NOT EXISTS melrah.healthcare_facility_approver_verification (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 facility_id uuid NOT NULL,
 approver_id uuid NOT NULL,
 verification_status text NOT NULL DEFAULT 'PENDING'
   CHECK (verification_status IN ('PENDING','VERIFIED','REVOKED','REJECTED')),
 verification_method text NOT NULL CHECK (verification_method IN
   ('HOSPITAL_DIRECTORY_CALLBACK','HOSPITAL_SIGNED_ATTESTATION',
    'HOSPITAL_IDENTITY_PROVIDER')),
 verification_reference text NOT NULL CHECK (length(trim(verification_reference))>0),
 verified_by uuid NOT NULL REFERENCES auth.users(id),
 verified_at timestamptz,
 valid_until timestamptz,
 revoked_at timestamptz,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,facility_id,approver_id)
   REFERENCES melrah.healthcare_facility_approver(tenant_id,facility_id,approver_id),
 CONSTRAINT verified_approver_complete CHECK (
  verification_status <> 'VERIFIED' OR
  (verified_at IS NOT NULL AND valid_until IS NOT NULL
   AND valid_until>verified_at AND revoked_at IS NULL)),
 CONSTRAINT revoked_approver_complete CHECK (
  verification_status <> 'REVOKED' OR revoked_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS healthcare_approver_verification_lookup
 ON melrah.healthcare_facility_approver_verification
 (tenant_id,facility_id,approver_id,verification_status,valid_until);
ALTER TABLE melrah.healthcare_facility_approver_verification ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON melrah.healthcare_facility_approver_verification
 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION melrah.healthcare_exception_approver_provenance_valid(
 p_exception_id uuid,p_at timestamptz DEFAULT now()
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,melrah AS $body$
DECLARE e record;
BEGIN
 SELECT tenant_id,facility_id,facility_approver_id,facility_approved_at
 INTO e FROM melrah.healthcare_access_exception WHERE id=p_exception_id;
 IF NOT FOUND OR e.facility_approver_id IS NULL OR e.facility_approved_at IS NULL
 THEN RETURN false; END IF;
 RETURN EXISTS(
  SELECT 1 FROM melrah.healthcare_facility_approver_verification v
  WHERE v.tenant_id=e.tenant_id AND v.facility_id=e.facility_id
    AND v.approver_id=e.facility_approver_id
    AND v.verification_status='VERIFIED'
    AND v.verified_at<=e.facility_approved_at
    AND v.valid_until>e.facility_approved_at
    AND v.verified_at<=p_at AND v.valid_until>p_at
    AND v.revoked_at IS NULL
 );
END $body$;
REVOKE ALL ON FUNCTION melrah.healthcare_exception_approver_provenance_valid(uuid,timestamptz)
 FROM PUBLIC,anon,authenticated;
-- Harden the existing roster-based check to require independent verification.
-- This is intentionally fail-closed for legacy approvals lacking provenance.
CREATE OR REPLACE FUNCTION melrah.healthcare_exception_authority_valid(
 p_exception_id uuid,p_at timestamptz DEFAULT now()
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,melrah AS $body$
DECLARE e record;
BEGIN
 SELECT * INTO e FROM melrah.healthcare_access_exception WHERE id=p_exception_id;
 IF NOT FOUND OR e.decision IS DISTINCT FROM 'APPROVED'
  OR e.facility_approver_id IS NULL
  OR e.facility_approved_at IS NULL OR e.expires_at IS NULL
  OR e.facility_approved_at>p_at OR e.expires_at<=p_at
  OR e.melrah_reviewer_id IS NULL OR e.melrah_reviewed_at IS NULL
  OR e.melrah_reviewer_id=e.melrah_requestor_id OR e.used_at IS NOT NULL
 THEN RETURN false; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM melrah.healthcare_facility_approver a
  WHERE a.tenant_id=e.tenant_id AND a.facility_id=e.facility_id
    AND a.approver_id=e.facility_approver_id AND a.active IS TRUE
    AND a.valid_from<=e.facility_approved_at AND a.valid_until>e.facility_approved_at
    AND a.valid_from<=p_at AND a.valid_until>p_at
 ) THEN RETURN false; END IF;
 IF NOT melrah.healthcare_exception_approver_provenance_valid(p_exception_id,p_at)
 THEN RETURN false; END IF;
 IF EXISTS(
  SELECT 1 FROM melrah.healthcare_access_exclusion x
  WHERE x.tenant_id=e.tenant_id AND x.facility_id=e.facility_id
    AND x.technician_id=e.technician_id AND x.active IS TRUE
    AND x.effective_at<=p_at
 ) THEN RETURN false; END IF;
 RETURN true;
END $body$;
REVOKE ALL ON FUNCTION melrah.healthcare_exception_authority_valid(uuid,timestamptz)
 FROM PUBLIC,anon,authenticated;
COMMIT;
-- OPEN: verification source authenticity, reviewer independence, immutable
-- evidence ingestion, cross-facility transfer, race-safe revocation and audit.
