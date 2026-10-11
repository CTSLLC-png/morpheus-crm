-- PROPOSAL ONLY. Verification evidence is append-only except for
-- a one-way VERIFIED -> REVOKED transition with an explicit timestamp.
-- Does not verify hospital identity or create a trusted ingestion endpoint.
CREATE OR REPLACE FUNCTION melrah.healthcare_approver_verification_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,melrah AS $body$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Hospital approver verification records cannot be deleted'
   USING ERRCODE='23514';
 END IF;
 IF ROW(NEW.id,NEW.tenant_id,NEW.facility_id,NEW.approver_id,
        NEW.verification_method,NEW.verification_reference,
        NEW.verified_by,NEW.verified_at,NEW.valid_until,NEW.recorded_at)
    IS DISTINCT FROM
    ROW(OLD.id,OLD.tenant_id,OLD.facility_id,OLD.approver_id,
        OLD.verification_method,OLD.verification_reference,
        OLD.verified_by,OLD.verified_at,OLD.valid_until,OLD.recorded_at) THEN
  RAISE EXCEPTION 'Hospital approver verification provenance is immutable'
   USING ERRCODE='23514';
 END IF;
 IF OLD.verification_status='VERIFIED'
    AND NEW.verification_status='REVOKED'
    AND OLD.revoked_at IS NULL
    AND NEW.revoked_at IS NOT NULL
    AND NEW.revoked_at>=OLD.verified_at
    AND NEW.revoked_at<=clock_timestamp() THEN
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'Hospital approver verification status cannot be rewritten'
  USING ERRCODE='23514';
END $body$;
DROP TRIGGER IF EXISTS healthcare_approver_verification_integrity
 ON melrah.healthcare_facility_approver_verification;
CREATE TRIGGER healthcare_approver_verification_integrity
BEFORE UPDATE OR DELETE ON melrah.healthcare_facility_approver_verification
FOR EACH ROW EXECUTE FUNCTION melrah.healthcare_approver_verification_integrity();
-- The caller's ability to INSERT VERIFIED evidence must still be restricted
-- to an independently authenticated, audited server-side onboarding workflow.
-- No client DML permissions are granted here.
