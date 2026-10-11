-- PROPOSAL ONLY: cooperative transaction-scoped serialization of MDR evidence.
-- Not deployed. All verifier write paths must use this trigger, and the
-- dispatch transaction must call healthcare_lock_credential_scope BEFORE
-- checking eligibility. Advisory locks alone are not authorization.
CREATE OR REPLACE FUNCTION melrah.healthcare_lock_credential_scope(
 p_tenant uuid, p_facility uuid, p_technician uuid
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,melrah AS $body$
BEGIN
 IF p_tenant IS NULL OR p_facility IS NULL OR p_technician IS NULL THEN
  RAISE EXCEPTION 'Credential lock scope is incomplete' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(
  hashtextextended('MDR_EVIDENCE:' || p_tenant::text || ':' ||
    p_facility::text || ':' || p_technician::text,0));
END $body$;
REVOKE ALL ON FUNCTION melrah.healthcare_lock_credential_scope(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION melrah.healthcare_evidence_write_serialize()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,melrah AS $body$
DECLARE old_key text; new_key text;
BEGIN
 IF TG_OP <> 'INSERT' THEN
  old_key := OLD.tenant_id::text || ':' || OLD.facility_id::text || ':' || OLD.technician_id::text;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  new_key := NEW.tenant_id::text || ':' || NEW.facility_id::text || ':' || NEW.technician_id::text;
 END IF;
 -- Deterministic order avoids lock inversion when a record moves scope.
 IF old_key IS NOT NULL AND (new_key IS NULL OR old_key <= new_key) THEN
  PERFORM melrah.healthcare_lock_credential_scope(OLD.tenant_id,OLD.facility_id,OLD.technician_id);
 END IF;
 IF new_key IS NOT NULL AND new_key IS DISTINCT FROM old_key THEN
  PERFORM melrah.healthcare_lock_credential_scope(NEW.tenant_id,NEW.facility_id,NEW.technician_id);
 END IF;
 IF old_key IS NOT NULL AND new_key IS NOT NULL AND old_key > new_key THEN
  PERFORM melrah.healthcare_lock_credential_scope(OLD.tenant_id,OLD.facility_id,OLD.technician_id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $body$;
REVOKE ALL ON FUNCTION melrah.healthcare_evidence_write_serialize() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS healthcare_evidence_write_serialize ON melrah.healthcare_credential_evidence;
CREATE TRIGGER healthcare_evidence_write_serialize
BEFORE INSERT OR UPDATE OR DELETE ON melrah.healthcare_credential_evidence
FOR EACH ROW EXECUTE FUNCTION melrah.healthcare_evidence_write_serialize();

-- OPEN SECURITY GATES:
-- * Facility policy and requirements can change independently; they need
--   compatible locks and a documented lock order before any dispatch unlock.
-- * Direct credential writes must not disable triggers or use privileged bypass.
-- * Re-check under lock; the disabled assignment RPC is not yet wired.
-- * Test concurrent transactions using two separate database connections.
