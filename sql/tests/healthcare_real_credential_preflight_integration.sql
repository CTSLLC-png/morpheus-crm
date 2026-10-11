-- Execute real evidence eligibility and real preflight, with real
-- advisory lock helpers; no exception request in this integration suite.
CREATE OR REPLACE FUNCTION pg_temp.assert_denied(expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE msg text; state text; before_row jsonb;after_row jsonb;
BEGIN
 SELECT to_jsonb(w) INTO before_row FROM melrah.work_order w;
 BEGIN
  PERFORM melrah.healthcare_dispatch_preflight_disabled(
   '00000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000004');
  RAISE EXCEPTION 'Unexpected dispatch authorization';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT,state=RETURNED_SQLSTATE;
 END;
 IF msg IS DISTINCT FROM expected OR state IS DISTINCT FROM '23514' THEN
  RAISE EXCEPTION 'Unexpected denial: [%] % expected %',state,msg,expected;
 END IF;
 SELECT to_jsonb(w) INTO after_row FROM melrah.work_order w;
 IF before_row IS DISTINCT FROM after_row THEN
  RAISE EXCEPTION 'Preflight mutated work order'; END IF;
END $$;
-- No evidence: real eligibility must deny.
SELECT pg_temp.assert_denied(
 'Healthcare evidence not eligible (exceptions cannot waive evidence yet)');
-- Insert one complete verified record; real eligibility becomes true.
INSERT INTO melrah.healthcare_credential_evidence VALUES(
 '00000000-0000-0000-0000-000000000006',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000003','SYMPLR',
 '00000000-0000-0000-0000-000000000004','VERIFIED',
 '00000000-0000-0000-0000-000000000009',
 'SYMPLR','facility-verification',now()-interval '1 day',now()+interval '30 days');
DO $$ BEGIN
 IF NOT melrah.healthcare_evidence_eligible(
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000004') THEN
  RAISE EXCEPTION 'Valid credential unexpectedly ineligible';
 END IF;
END $$;
SELECT pg_temp.assert_denied(
 'Healthcare dispatch remains disabled: integrated preflight is non-authorizing');
-- Real hard-stop row must override verified credentials.
INSERT INTO melrah.healthcare_access_exclusion VALUES(
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-000000000004',true,now()-interval '1 hour');
SELECT pg_temp.assert_denied('Hospital facility access restriction blocks dispatch');
DELETE FROM melrah.healthcare_access_exclusion;
-- Real revoked evidence must deny again.
UPDATE melrah.healthcare_credential_evidence SET status='REVOKED';
SELECT pg_temp.assert_denied(
 'Healthcare evidence not eligible (exceptions cannot waive evidence yet)');
DO $$ BEGIN RAISE NOTICE 'PASS: real eligibility and preflight reject missing, revoked, banned and otherwise eligible assignments'; END $$;
