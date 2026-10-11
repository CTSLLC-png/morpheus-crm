-- PROPOSAL ONLY: independent hospital approver roster and exception validation.
-- No dispatch unlock. Requires healthcare_access_exception_staging.sql.
-- This roster must be populated ONLY through separately authenticated facility
-- onboarding; its contents cannot prove an approver's real-world identity.
BEGIN;
CREATE TABLE IF NOT EXISTS melrah.healthcare_facility_approver (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 facility_id uuid NOT NULL,
 approver_id uuid NOT NULL,
 authority_reference text NOT NULL CHECK(length(trim(authority_reference))>0),
 active boolean NOT NULL DEFAULT false,
 valid_from timestamptz NOT NULL,
 valid_until timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,facility_id,approver_id),
 FOREIGN KEY(tenant_id,facility_id)
 REFERENCES melrah.healthcare_facility_scope(tenant_id,facility_id),
 CHECK(valid_until>valid_from)
);
ALTER TABLE melrah.healthcare_facility_approver ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON melrah.healthcare_facility_approver FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION melrah.healthcare_exception_authority_valid(
 p_exception_id uuid, p_at timestamptz DEFAULT now()
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,melrah AS $body$
DECLARE e record;
BEGIN
 SELECT * INTO e FROM melrah.healthcare_access_exception
 WHERE id=p_exception_id;
 IF NOT FOUND OR e.decision IS DISTINCT FROM 'APPROVED'
  OR e.facility_approver_id IS NULL
  OR e.facility_approved_at IS NULL OR e.expires_at IS NULL
  OR e.facility_approved_at>p_at OR e.expires_at<=p_at
  OR e.melrah_reviewer_id IS NULL OR e.melrah_reviewed_at IS NULL
  OR e.melrah_reviewer_id=e.melrah_requestor_id
  OR e.used_at IS NOT NULL
 THEN RETURN false; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM melrah.healthcare_facility_approver a
  WHERE a.tenant_id=e.tenant_id AND a.facility_id=e.facility_id
    AND a.approver_id=e.facility_approver_id
    AND a.active IS TRUE
    AND a.valid_from<=e.facility_approved_at
    AND a.valid_until>e.facility_approved_at
    AND a.valid_from<=p_at AND a.valid_until>p_at
 ) THEN RETURN false; END IF;
 IF EXISTS (
  SELECT 1 FROM melrah.healthcare_access_exclusion x
  WHERE x.tenant_id=e.tenant_id AND x.facility_id=e.facility_id
    AND x.technician_id=e.technician_id
    AND x.active IS TRUE AND x.effective_at<=p_at
 ) THEN RETURN false; END IF;
 RETURN true;
END $body$;
REVOKE ALL ON FUNCTION melrah.healthcare_exception_authority_valid(uuid,timestamptz)
 FROM PUBLIC,anon,authenticated;
COMMIT;
-- NOT AN ACCESS DECISION: does not verify account/work-order ownership,
-- requirement waiver eligibility, trusted ingestion, append-only approvals,
-- authorization state transitions, or concurrent withdrawals. A future
-- dispatch function must verify these under transactional locking.
