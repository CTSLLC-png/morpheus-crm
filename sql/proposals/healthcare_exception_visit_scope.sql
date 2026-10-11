-- PROPOSAL ONLY. Read-only visit-scope gate; not wired to dispatch.
-- Must be composed with credential requirement waivability, authority roster,
-- exclusion precedence and transactional locks before any dispatch release.
CREATE OR REPLACE FUNCTION melrah.healthcare_exception_matches_visit(
 p_exception_id uuid,
 p_work_order_id uuid,
 p_technician_id uuid,
 p_requirement_id uuid,
 p_at timestamptz DEFAULT now()
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,melrah AS $body$
DECLARE e record; wo record;
BEGIN
 IF p_exception_id IS NULL OR p_work_order_id IS NULL
    OR p_technician_id IS NULL OR p_requirement_id IS NULL
 THEN RETURN false; END IF;
 SELECT * INTO e FROM melrah.healthcare_access_exception WHERE id=p_exception_id;
 IF NOT FOUND OR e.work_order_id IS DISTINCT FROM p_work_order_id
   OR e.technician_id IS DISTINCT FROM p_technician_id
   OR e.requirement_id IS DISTINCT FROM p_requirement_id
 THEN RETURN false; END IF;
 SELECT * INTO wo FROM melrah.work_order WHERE id=p_work_order_id;
 IF NOT FOUND OR wo.program_key IS DISTINCT FROM 'HEALTHCARE_MDR'
    OR wo.tenant_id IS DISTINCT FROM e.tenant_id
    OR wo.account_id IS DISTINCT FROM e.account_id
    OR wo.facility_id IS DISTINCT FROM e.facility_id
 THEN RETURN false; END IF;
 IF NOT melrah.healthcare_exception_authority_valid(p_exception_id,p_at)
 THEN RETURN false; END IF;
 RETURN true;
END $body$;
REVOKE ALL ON FUNCTION melrah.healthcare_exception_matches_visit(uuid,uuid,uuid,uuid,timestamptz)
 FROM PUBLIC,anon,authenticated;
