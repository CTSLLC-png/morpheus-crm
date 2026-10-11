-- PROPOSAL ONLY: one consistent lock order for a future authorization transaction.
-- Caller must first lock work_order FOR UPDATE, then call this function,
-- then lock the specific exception row FOR UPDATE (when applicable),
-- then re-evaluate credential, exclusion, authority and visit scope.
-- No dispatch writes or guard bypass. Advisory locks are NOT authorization.
CREATE OR REPLACE FUNCTION melrah.healthcare_lock_dispatch_safety_scope(
 p_tenant uuid,p_facility uuid,p_technician uuid
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,melrah AS $body$
BEGIN
 IF p_tenant IS NULL OR p_facility IS NULL OR p_technician IS NULL THEN
  RAISE EXCEPTION 'Healthcare safety scope incomplete' USING ERRCODE='23514';
 END IF;
 -- Access/hard-stop lock always before credential evidence lock.
 PERFORM melrah.healthcare_lock_access_scope(p_tenant,p_facility,p_technician);
 PERFORM melrah.healthcare_lock_credential_scope(p_tenant,p_facility,p_technician);
END $body$;
REVOKE ALL ON FUNCTION melrah.healthcare_lock_dispatch_safety_scope(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
-- Remaining gaps: hospital policy/requirement edits and approver roster
-- deactivation do not yet participate; integrate before dispatch enablement.
