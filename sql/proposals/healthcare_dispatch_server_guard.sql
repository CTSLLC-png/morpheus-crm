-- PROPOSAL ONLY. DO NOT APPLY TO PRODUCTION WITHOUT APPROVAL AND TESTS.
-- Protect the two existing dispatch RPCs from healthcare assignments before
-- server-side facility credential verification is implemented.
-- Install AFTER confirming the live RPC signatures and current function bodies.
-- This trigger protects changes made through RPCs AND direct table UPDATEs.
-- It deliberately does not change existing non-healthcare dispatch behavior.
--
-- WARNING: A trigger is not sufficient if a privileged role disables triggers,
-- changes program_key in the same update, or uses an alternative write path.
-- Audit all writers, privileges and program_key immutability before production.

CREATE OR REPLACE FUNCTION melrah.healthcare_prevent_unverified_dispatch()
RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, melrah
AS $body$
BEGIN
  IF OLD.program_key = 'HEALTHCARE_MDR' OR NEW.program_key = 'HEALTHCARE_MDR' THEN
    -- Prevent the status / assignment from progressing while there is no
    -- authoritative, database-verified facility clearance check.
    IF NEW.assigned_resource_id IS DISTINCT FROM OLD.assigned_resource_id
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'CANCELLED')
       OR NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at
       OR NEW.en_route_at IS DISTINCT FROM OLD.en_route_at
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
    THEN
      RAISE EXCEPTION 'Healthcare dispatch blocked: server-side credential verification is not enabled'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$body$;

DROP TRIGGER IF EXISTS healthcare_prevent_unverified_dispatch ON melrah.work_order;
CREATE TRIGGER healthcare_prevent_unverified_dispatch
BEFORE UPDATE ON melrah.work_order
FOR EACH ROW EXECUTE FUNCTION melrah.healthcare_prevent_unverified_dispatch();

-- Acceptance cases for isolated testing:
-- 1. HEALTHCARE_MDR: DRAFT -> RELEASED denied.
-- 2. HEALTHCARE_MDR: assigned_resource_id change denied.
-- 3. HEALTHCARE_MDR: dispatch timestamp mutation denied.
-- 4. HEALTHCARE_MDR: cancellation permitted with unchanged assignment/timestamps.
-- 5. ORGANICS_COFFEE and CANNABIS_PACKAGING: unchanged behavior.
-- 6. Changing program_key to/from HEALTHCARE_MDR during assignment denied.
-- 7. Validate RLS, direct INSERT paths, privileges, other RPCs and service roles.
