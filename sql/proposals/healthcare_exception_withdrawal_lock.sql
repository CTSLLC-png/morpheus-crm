-- PROPOSAL ONLY: serialize an individual hospital exception against
-- withdrawal, expiry, consumption, and other changes. No dispatch unlock.
-- Future dispatch must SELECT this row FOR UPDATE and re-check the approval
-- under that lock; withdrawal must update the same row in a transaction.
-- PostgreSQL row locks protect this row, not related hospital roster or
-- facility exclusions, which need their own coordination.
CREATE OR REPLACE FUNCTION melrah.healthcare_exception_lock_for_dispatch(
 p_exception_id uuid
) RETURNS melrah.healthcare_access_exception
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,melrah AS $body$
DECLARE e melrah.healthcare_access_exception%rowtype;
BEGIN
 SELECT * INTO e FROM melrah.healthcare_access_exception
 WHERE id=p_exception_id FOR UPDATE;
 IF NOT FOUND OR e.decision IS DISTINCT FROM 'APPROVED'
  OR e.used_at IS NOT NULL OR e.expires_at IS NULL
  OR e.expires_at<=clock_timestamp()
 THEN RAISE EXCEPTION 'Hospital exception unavailable for dispatch'
   USING ERRCODE='23514'; END IF;
 RETURN e;
END $body$;
REVOKE ALL ON FUNCTION melrah.healthcare_exception_lock_for_dispatch(uuid)
 FROM PUBLIC,anon,authenticated;
