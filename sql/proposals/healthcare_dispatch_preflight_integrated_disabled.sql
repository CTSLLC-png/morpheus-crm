-- PROPOSAL ONLY. Consolidated, non-authorizing dispatch preflight.
-- Locks work order, facility policy, access scope, evidence scope and optional
-- exception row in that order. It ALWAYS raises an error; no writes/dispatch.
-- A future authorizing function must implement hospital-local service time,
-- trusted waiver classification, exact required-evidence coverage, audited
-- identity/approval, final exclusion recheck, and protected RPC integration.
CREATE OR REPLACE FUNCTION melrah.healthcare_dispatch_preflight_disabled(
 p_work_order_id uuid,
 p_technician_id uuid,
 p_exception_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,melrah,core AS $body$
DECLARE wo melrah.work_order%rowtype;
DECLARE exc melrah.healthcare_access_exception%rowtype;
DECLARE eligible boolean;
BEGIN
 IF p_work_order_id IS NULL OR p_technician_id IS NULL THEN
  RAISE EXCEPTION 'Healthcare work order and technician required' USING ERRCODE='23514';
 END IF;
 SELECT * INTO wo FROM melrah.work_order WHERE id=p_work_order_id FOR UPDATE;
 IF NOT FOUND OR wo.program_key IS DISTINCT FROM 'HEALTHCARE_MDR'
    OR wo.tenant_id IS NULL OR wo.facility_id IS NULL OR wo.account_id IS NULL
 THEN RAISE EXCEPTION 'Healthcare work order scope invalid' USING ERRCODE='23514'; END IF;
 IF NOT core.member_of(wo.tenant_id) THEN
  RAISE EXCEPTION 'Healthcare dispatcher not authorized' USING ERRCODE='42501';
 END IF;
 IF wo.status IS DISTINCT FROM 'DRAFT' OR wo.assigned_resource_id IS NOT NULL THEN
  RAISE EXCEPTION 'Healthcare work order not assignable' USING ERRCODE='23514';
 END IF;
 -- Lock order: work order -> facility -> access -> evidence -> exception.
 PERFORM melrah.healthcare_lock_facility_policy(wo.tenant_id,wo.facility_id);
 PERFORM melrah.healthcare_lock_dispatch_safety_scope(
  wo.tenant_id,wo.facility_id,p_technician_id);
 -- Check hard stops even if there is no exception request.
 IF EXISTS (
  SELECT 1 FROM melrah.healthcare_access_exclusion x
  WHERE x.tenant_id=wo.tenant_id AND x.facility_id=wo.facility_id
    AND x.technician_id=p_technician_id AND x.active IS TRUE
    AND x.effective_at<=clock_timestamp()
 ) THEN
  RAISE EXCEPTION 'Hospital facility access restriction blocks dispatch'
    USING ERRCODE='23514';
 END IF;
 -- Evidence clearance is still all-or-nothing. An administrative exception
 -- is not treated as a substitute until per-requirement waivability exists.
 eligible:=melrah.healthcare_evidence_eligible(p_work_order_id,p_technician_id);
 IF p_exception_id IS NOT NULL THEN
  exc:=melrah.healthcare_exception_lock_for_dispatch(p_exception_id);
  IF NOT melrah.healthcare_exception_matches_visit(
    p_exception_id,p_work_order_id,p_technician_id,exc.requirement_id,clock_timestamp()
  ) THEN
   RAISE EXCEPTION 'Hospital exception invalid for this visit'
     USING ERRCODE='23514';
  END IF;
 END IF;
 IF NOT eligible THEN
  RAISE EXCEPTION 'Healthcare evidence not eligible (exceptions cannot waive evidence yet)'
    USING ERRCODE='23514';
 END IF;
 RAISE EXCEPTION 'Healthcare dispatch remains disabled: integrated preflight is non-authorizing'
  USING ERRCODE='23514';
END $body$;
REVOKE ALL ON FUNCTION melrah.healthcare_dispatch_preflight_disabled(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
