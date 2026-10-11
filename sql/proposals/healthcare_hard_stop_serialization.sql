-- PROPOSAL ONLY: shared transaction-scoped lock for facility exclusions.
-- Dispatch MUST acquire the same scope lock and recheck hard stops under it.
-- This does not permit dispatch and does not replace the current guard.
CREATE OR REPLACE FUNCTION melrah.healthcare_lock_access_scope(
 p_tenant uuid,p_facility uuid,p_technician uuid
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,melrah AS $body$
BEGIN
 IF p_tenant IS NULL OR p_facility IS NULL OR p_technician IS NULL THEN
  RAISE EXCEPTION 'Hospital access lock scope incomplete' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
  'MDR_ACCESS:'||p_tenant::text||':'||p_facility::text||':'||p_technician::text,0));
END $body$;
REVOKE ALL ON FUNCTION melrah.healthcare_lock_access_scope(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION melrah.healthcare_exclusion_write_serialize()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,melrah AS $body$
DECLARE old_key text; new_key text;
BEGIN
 IF TG_OP <> 'INSERT' THEN
  old_key:=OLD.tenant_id::text||':'||OLD.facility_id::text||':'||OLD.technician_id::text;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  new_key:=NEW.tenant_id::text||':'||NEW.facility_id::text||':'||NEW.technician_id::text;
 END IF;
 IF old_key IS NOT NULL AND (new_key IS NULL OR old_key<=new_key) THEN
  PERFORM melrah.healthcare_lock_access_scope(OLD.tenant_id,OLD.facility_id,OLD.technician_id);
 END IF;
 IF new_key IS NOT NULL AND new_key IS DISTINCT FROM old_key THEN
  PERFORM melrah.healthcare_lock_access_scope(NEW.tenant_id,NEW.facility_id,NEW.technician_id);
 END IF;
 IF old_key IS NOT NULL AND new_key IS NOT NULL AND old_key>new_key THEN
  PERFORM melrah.healthcare_lock_access_scope(OLD.tenant_id,OLD.facility_id,OLD.technician_id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $body$;
REVOKE ALL ON FUNCTION melrah.healthcare_exclusion_write_serialize()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS healthcare_exclusion_write_serialize ON melrah.healthcare_access_exclusion;
CREATE TRIGGER healthcare_exclusion_write_serialize
BEFORE INSERT OR UPDATE OR DELETE ON melrah.healthcare_access_exclusion
FOR EACH ROW EXECUTE FUNCTION melrah.healthcare_exclusion_write_serialize();
-- OPEN GATES: emergency exclusion notifications may arrive during an in-flight
-- assignment. Database serialization determines transaction ordering; it
-- cannot guarantee instant physical access revocation or halt a technician
-- already on premises. Dispatch and arrival checks plus live notification,
-- policy locks, trusted ingestion and audit are still required.
