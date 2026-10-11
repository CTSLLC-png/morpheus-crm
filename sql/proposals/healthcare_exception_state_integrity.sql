-- PROPOSAL ONLY. Prevent exception scope edits, approval rewriting,
-- reopening withdrawn/denied/expired exceptions, and reuse after consumption.
-- Does not authenticate hospital approvers or authorize dispatch.
CREATE OR REPLACE FUNCTION melrah.healthcare_exception_state_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,melrah AS $body$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Healthcare exceptions cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF ROW(NEW.id,NEW.tenant_id,NEW.account_id,NEW.facility_id,NEW.work_order_id,
        NEW.technician_id,NEW.requirement_id,NEW.provider_key,NEW.reason_code,
        NEW.melrah_requestor_id,NEW.created_at)
    IS DISTINCT FROM
    ROW(OLD.id,OLD.tenant_id,OLD.account_id,OLD.facility_id,OLD.work_order_id,
        OLD.technician_id,OLD.requirement_id,OLD.provider_key,OLD.reason_code,
        OLD.melrah_requestor_id,OLD.created_at) THEN
  RAISE EXCEPTION 'Healthcare exception scope is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.decision IN ('DENIED','WITHDRAWN','EXPIRED') THEN
  RAISE EXCEPTION 'Healthcare exception terminal decision cannot change'
   USING ERRCODE='23514';
 END IF;
 IF OLD.decision='REQUESTED' AND NEW.decision NOT IN
    ('REQUESTED','APPROVED','DENIED','WITHDRAWN','EXPIRED') THEN
  RAISE EXCEPTION 'Invalid healthcare exception transition' USING ERRCODE='23514';
 END IF;
 IF OLD.decision='APPROVED' AND NEW.decision NOT IN
    ('APPROVED','WITHDRAWN','EXPIRED') THEN
  RAISE EXCEPTION 'Approved healthcare exception cannot be reopened'
   USING ERRCODE='23514';
 END IF;
 IF OLD.decision='APPROVED' AND
    ROW(NEW.facility_approver_id,NEW.facility_authorization_ref,
        NEW.facility_approved_at,NEW.melrah_reviewer_id,NEW.melrah_reviewed_at,
        NEW.expires_at)
    IS DISTINCT FROM
    ROW(OLD.facility_approver_id,OLD.facility_authorization_ref,
        OLD.facility_approved_at,OLD.melrah_reviewer_id,OLD.melrah_reviewed_at,
        OLD.expires_at) THEN
  RAISE EXCEPTION 'Approved healthcare exception provenance is immutable'
   USING ERRCODE='23514';
 END IF;
 IF OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at THEN
  RAISE EXCEPTION 'Consumed healthcare exception cannot be reused'
   USING ERRCODE='23514';
 END IF;
 IF NEW.used_at IS NOT NULL AND
    (OLD.decision IS DISTINCT FROM 'APPROVED'
     OR NEW.decision IS DISTINCT FROM 'APPROVED') THEN
  RAISE EXCEPTION 'Only approved healthcare exceptions can be consumed'
   USING ERRCODE='23514';
 END IF;
 IF NEW.used_at IS NOT NULL AND NEW.used_at>clock_timestamp() THEN
  RAISE EXCEPTION 'Healthcare exception consumption cannot be future-dated'
   USING ERRCODE='23514';
 END IF;
 NEW.updated_at:=clock_timestamp();
 RETURN NEW;
END $body$;
DROP TRIGGER IF EXISTS healthcare_exception_state_integrity
 ON melrah.healthcare_access_exception;
CREATE TRIGGER healthcare_exception_state_integrity
BEFORE UPDATE OR DELETE ON melrah.healthcare_access_exception
FOR EACH ROW EXECUTE FUNCTION melrah.healthcare_exception_state_integrity();
-- No client-side DML privileges are granted.
