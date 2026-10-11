-- CI contract: integrated preflight remains non-authorizing.
-- Static checks intentionally do not claim full runtime integration.
DO $test$
DECLARE body text;
BEGIN
 SELECT pg_get_functiondef(
  'melrah.healthcare_dispatch_preflight_disabled(uuid,uuid,uuid)'::regprocedure
 ) INTO body;
 IF body NOT LIKE '%FOR UPDATE%' OR
    body NOT LIKE '%healthcare_lock_facility_policy%' OR
    body NOT LIKE '%healthcare_lock_dispatch_safety_scope%' OR
    body NOT LIKE '%healthcare_access_exclusion%' OR
    body NOT LIKE '%healthcare_evidence_eligible%' OR
    body NOT LIKE '%healthcare_exception_lock_for_dispatch%' OR
    body NOT LIKE '%healthcare_exception_matches_visit%' OR
    body NOT LIKE '%Healthcare dispatch remains disabled%' THEN
  RAISE EXCEPTION 'FAIL: integrated preflight lost a required gate';
 END IF;
 IF body ~* 'UPDATE[[:space:]]+melrah\\.work_order'
    OR body ~* 'INSERT[[:space:]]+INTO[[:space:]]+melrah\\.service_appointment' THEN
  RAISE EXCEPTION 'FAIL: preflight unexpectedly mutates dispatch';
 END IF;
 RAISE NOTICE 'PASS: all gates referenced, dispatch remains blocked';
END $test$;
