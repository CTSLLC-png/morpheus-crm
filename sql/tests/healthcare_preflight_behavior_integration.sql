-- Exercise actual integrated preflight and assert exact denial reason,
-- SQLSTATE and no mutation. Each test changes one condition only.
CREATE OR REPLACE FUNCTION pg_temp.assert_preflight_denied(
 p_expected_state text,p_expected_message text,p_exception uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_row jsonb;after_row jsonb;err_state text;err_message text;
BEGIN
 SELECT to_jsonb(w) INTO before_row FROM melrah.work_order w
 WHERE id='00000000-0000-0000-0000-000000000001';
 BEGIN
  PERFORM melrah.healthcare_dispatch_preflight_disabled(
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000005',p_exception);
  RAISE EXCEPTION 'Unexpected preflight success';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS err_state=RETURNED_SQLSTATE,err_message=MESSAGE_TEXT;
 END;
 IF err_state IS DISTINCT FROM p_expected_state OR
    err_message IS DISTINCT FROM p_expected_message THEN
  RAISE EXCEPTION 'Wrong denial: expected [%] %, received [%] %',
   p_expected_state,p_expected_message,err_state,err_message;
 END IF;
 SELECT to_jsonb(w) INTO after_row FROM melrah.work_order w
 WHERE id='00000000-0000-0000-0000-000000000001';
 IF before_row IS DISTINCT FROM after_row THEN
  RAISE EXCEPTION 'Work order mutated on rejected preflight';
 END IF;
END $$;
SELECT pg_temp.assert_preflight_denied('23514',
 'Healthcare dispatch remains disabled: integrated preflight is non-authorizing');
UPDATE public.healthcare_preflight_test_flags SET member_ok=false;
SELECT pg_temp.assert_preflight_denied('42501','Healthcare dispatcher not authorized');
UPDATE public.healthcare_preflight_test_flags SET member_ok=true;
UPDATE melrah.work_order SET status='RELEASED';
SELECT pg_temp.assert_preflight_denied('23514','Healthcare work order not assignable');
UPDATE melrah.work_order SET status='DRAFT';
INSERT INTO melrah.healthcare_access_exclusion VALUES(
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-000000000005',true,now()-interval '1 hour');
SELECT pg_temp.assert_preflight_denied('23514',
 'Hospital facility access restriction blocks dispatch');
DELETE FROM melrah.healthcare_access_exclusion;
UPDATE public.healthcare_preflight_test_flags SET evidence_ok=false;
SELECT pg_temp.assert_preflight_denied('23514',
 'Healthcare evidence not eligible (exceptions cannot waive evidence yet)');
UPDATE public.healthcare_preflight_test_flags SET evidence_ok=true,exception_ok=false;
SELECT pg_temp.assert_preflight_denied('23514',
 'Hospital exception invalid for this visit',
 '00000000-0000-0000-0000-000000000006');
UPDATE public.healthcare_preflight_test_flags SET exception_ok=true;
SELECT pg_temp.assert_preflight_denied('23514',
 'Healthcare dispatch remains disabled: integrated preflight is non-authorizing',
 '00000000-0000-0000-0000-000000000006');
DO $$ BEGIN RAISE NOTICE 'PASS: seven behavioral paths deny and preserve work order'; END $$;
