-- Isolated contract checks: function must never permit healthcare dispatch.
DO $test$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('melrah.healthcare_dispatch_assign_checked(uuid,uuid,timestamptz)'::regprocedure)
 INTO definition;
 IF definition NOT LIKE '%FOR UPDATE%' THEN
  RAISE EXCEPTION 'FAIL: work order row lock missing'; END IF;
 IF definition NOT LIKE '%core.member_of(wo.tenant_id)%' THEN
  RAISE EXCEPTION 'FAIL: tenant authorization missing'; END IF;
 IF definition NOT LIKE '%healthcare_evidence_eligible%' THEN
  RAISE EXCEPTION 'FAIL: database credential evaluation missing'; END IF;
 IF definition NOT LIKE '%dispatch remains disabled%' THEN
  RAISE EXCEPTION 'FAIL: fail-closed guard missing'; END IF;
 IF has_function_privilege('authenticated',
  'melrah.healthcare_dispatch_assign_checked(uuid,uuid,timestamptz)','EXECUTE')
 THEN RAISE EXCEPTION 'FAIL: authenticated client can call disabled dispatch'; END IF;
 RAISE NOTICE 'PASS: locked, tenant-scoped, credential-gated disabled assignment contract';
END $test$;
