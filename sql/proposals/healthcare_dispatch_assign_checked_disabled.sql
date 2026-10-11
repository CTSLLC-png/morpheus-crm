-- PROPOSAL ONLY. DO NOT APPLY TO PRODUCTION.
-- Atomic credential-gated assignment proof of concept. This does not replace
-- existing melrah_dispatch_assign, and healthcare guard remains active.
-- Caller must be authorized to dispatch for the work order's tenant.
-- This function is deliberately not granted to anon/authenticated.
CREATE OR REPLACE FUNCTION melrah.healthcare_dispatch_assign_checked(
 p_work_order_id uuid,
 p_resource_id uuid,
 p_scheduled_start timestamptz DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, melrah, core
AS $body$
DECLARE
 wo melrah.work_order%rowtype;
 appointment_id uuid;
BEGIN
 IF p_work_order_id IS NULL OR p_resource_id IS NULL THEN
   RAISE EXCEPTION 'Healthcare assignment requires work order and technician'
     USING ERRCODE='23514';
 END IF;
 SELECT * INTO wo FROM melrah.work_order
 WHERE id=p_work_order_id FOR UPDATE;
 IF NOT FOUND OR wo.program_key IS DISTINCT FROM 'HEALTHCARE_MDR' THEN
   RAISE EXCEPTION 'Healthcare work order not found' USING ERRCODE='23514';
 END IF;
 IF wo.status IS DISTINCT FROM 'DRAFT'
    OR wo.assigned_resource_id IS NOT NULL THEN
   RAISE EXCEPTION 'Healthcare work order is not assignable' USING ERRCODE='23514';
 END IF;
 -- Explicit tenant-specific membership; avoid relying on a global melrah tenant.
 IF NOT core.member_of(wo.tenant_id) THEN
   RAISE EXCEPTION 'Healthcare dispatcher not authorized' USING ERRCODE='42501';
 END IF;
 -- Evidence is checked while the work-order row is locked. This alone does
 -- NOT serialize concurrent verifier updates/revocations.
 IF NOT melrah.healthcare_evidence_eligible(p_work_order_id,p_resource_id) THEN
   RAISE EXCEPTION 'Healthcare credentials not verified' USING ERRCODE='23514';
 END IF;
 -- Intentionally no work-order mutation: existing fail-closed trigger blocks
 -- healthcare progression. This proposal must NOT silently bypass it.
 RAISE EXCEPTION 'Healthcare dispatch remains disabled pending atomic verifier locking and guard integration'
   USING ERRCODE='23514';
 RETURN appointment_id;
END
$body$;
REVOKE ALL ON FUNCTION melrah.healthcare_dispatch_assign_checked(uuid,uuid,timestamptz)
 FROM PUBLIC, anon, authenticated;
