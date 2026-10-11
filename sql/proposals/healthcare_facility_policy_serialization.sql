-- PROPOSAL ONLY: serialize hospital-wide credential policy, requirements
-- and approver roster edits against dispatch validation.
-- Order for future dispatch: work_order row -> facility policy lock ->
-- access scope -> evidence scope -> specific exception row.
-- All facility policy/requirement/roster mutation paths must use this lock.
-- Does not enable dispatch or bypass existing healthcare guard.
CREATE OR REPLACE FUNCTION melrah.healthcare_lock_facility_policy(
 p_tenant uuid,p_facility uuid
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,melrah AS $body$
BEGIN
 IF p_tenant IS NULL OR p_facility IS NULL THEN
  RAISE EXCEPTION 'Facility policy lock scope incomplete' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
  'MDR_FACILITY_POLICY:'||p_tenant::text||':'||p_facility::text,0));
END $body$;
REVOKE ALL ON FUNCTION melrah.healthcare_lock_facility_policy(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION melrah.healthcare_facility_policy_write_serialize()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,melrah AS $body$
DECLARE old_key text;new_key text;
BEGIN
 IF TG_OP <> 'INSERT' THEN
  old_key:=OLD.tenant_id::text||':'||OLD.facility_id::text;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  new_key:=NEW.tenant_id::text||':'||NEW.facility_id::text;
 END IF;
 IF old_key IS NOT NULL AND (new_key IS NULL OR old_key<=new_key) THEN
  PERFORM melrah.healthcare_lock_facility_policy(OLD.tenant_id,OLD.facility_id);
 END IF;
 IF new_key IS NOT NULL AND new_key IS DISTINCT FROM old_key THEN
  PERFORM melrah.healthcare_lock_facility_policy(NEW.tenant_id,NEW.facility_id);
 END IF;
 IF old_key IS NOT NULL AND new_key IS NOT NULL AND old_key>new_key THEN
  PERFORM melrah.healthcare_lock_facility_policy(OLD.tenant_id,OLD.facility_id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $body$;
REVOKE ALL ON FUNCTION melrah.healthcare_facility_policy_write_serialize()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS healthcare_policy_write_serialize ON melrah.healthcare_facility_credentialing;
CREATE TRIGGER healthcare_policy_write_serialize
BEFORE INSERT OR UPDATE OR DELETE ON melrah.healthcare_facility_credentialing
FOR EACH ROW EXECUTE FUNCTION melrah.healthcare_facility_policy_write_serialize();
DROP TRIGGER IF EXISTS healthcare_requirement_write_serialize ON melrah.healthcare_facility_requirement;
CREATE TRIGGER healthcare_requirement_write_serialize
BEFORE INSERT OR UPDATE OR DELETE ON melrah.healthcare_facility_requirement
FOR EACH ROW EXECUTE FUNCTION melrah.healthcare_facility_policy_write_serialize();
DROP TRIGGER IF EXISTS healthcare_approver_write_serialize ON melrah.healthcare_facility_approver;
CREATE TRIGGER healthcare_approver_write_serialize
BEFORE INSERT OR UPDATE OR DELETE ON melrah.healthcare_facility_approver
FOR EACH ROW EXECUTE FUNCTION melrah.healthcare_facility_policy_write_serialize();
-- IMPORTANT: BEFORE row triggers cannot fully protect statement-level
-- changes or TRUNCATE. Production roles must lack TRUNCATE and bypass rights.
-- Cross-table writes and locks must use consistent ordering to avoid deadlock.
