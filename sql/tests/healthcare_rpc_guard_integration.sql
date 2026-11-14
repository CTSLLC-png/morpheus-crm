-- Transactional tests of the actual public.melrah_dispatch_set_status
-- function, exercised against the proposed healthcare guard triggers.
--
-- WHY MDR-1 IS CREATED UNASSIGNED
--
-- This fixture used to insert MDR-1 with assigned_resource_id already set, so
-- that melrah_dispatch_set_status would clear its own "assign a collector
-- before releasing" precondition and its UPDATE would reach the healthcare
-- trigger. healthcare_prevent_unverified_insert refuses that INSERT, and it is
-- right to: a healthcare work order may not be born assigned. The fixture was
-- violating the very rule the test exists to verify, so the fixture is what
-- changed here -- relaxing the guard to accommodate it would have switched off
-- a healthcare safety check to make a test go green.
--
-- With both guard triggers installed there is no route to an assigned
-- healthcare work order at all, so each layer is asserted where it fires:
--   1. the INSERT guard refuses a pre-assigned healthcare work order;
--   2. the UPDATE guard refuses an assignment (SQLSTATE 23514, 'Healthcare
--      dispatch blocked:%') -- this is what keeps MDR-1 unassigned;
--   3. the status RPC therefore refuses RELEASED on its own precondition and
--      leaves the row in DRAFT;
--   4. CANCELLED is still permitted for healthcare, through the RPC;
--   5. ORGANICS_COFFEE still progresses through the same RPC untouched.
BEGIN;
INSERT INTO melrah.work_order(id,wo_number,program_key,status,assigned_resource_id)
VALUES
('00000000-0000-0000-0000-000000000001','MDR-1','HEALTHCARE_MDR','DRAFT',NULL),
('00000000-0000-0000-0000-000000000002','COFFEE-1','ORGANICS_COFFEE','DRAFT',
 '00000000-0000-0000-0000-000000000099');
DO $test$
DECLARE
 blocked boolean;
 result text;
 error_code text;
 error_message text;
BEGIN
 -- 1. A healthcare work order cannot be created already assigned.
 blocked := false; error_code := NULL; error_message := NULL;
 BEGIN
  INSERT INTO melrah.work_order(id,wo_number,program_key,status,assigned_resource_id)
  VALUES ('00000000-0000-0000-0000-000000000003','MDR-2','HEALTHCARE_MDR','DRAFT',
          '00000000-0000-0000-0000-000000000098');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_code = RETURNED_SQLSTATE, error_message = MESSAGE_TEXT;
  blocked := error_code = '23514'
         AND error_message LIKE 'Healthcare work orders must be created unassigned in DRAFT%';
 END;
 IF NOT blocked THEN
  RAISE EXCEPTION 'FAIL: pre-assigned healthcare INSERT was not rejected by the healthcare insert guard (SQLSTATE %, message %)',error_code,error_message;
 END IF;

 -- 2. Assigning a collector to a healthcare work order is refused, and
 --    specifically by the healthcare dispatch trigger.
 blocked := false; error_code := NULL; error_message := NULL;
 BEGIN
  UPDATE melrah.work_order
     SET assigned_resource_id = '00000000-0000-0000-0000-000000000098'
   WHERE wo_number = 'MDR-1';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_code = RETURNED_SQLSTATE, error_message = MESSAGE_TEXT;
  blocked := error_code = '23514' AND error_message LIKE 'Healthcare dispatch blocked:%';
 END;
 IF NOT blocked THEN
  RAISE EXCEPTION 'FAIL: healthcare assignment did not fail specifically at the healthcare trigger (SQLSTATE %, message %)',error_code,error_message;
 END IF;
 IF (SELECT assigned_resource_id FROM melrah.work_order WHERE wo_number='MDR-1') IS NOT NULL THEN
  RAISE EXCEPTION 'FAIL: healthcare work order was assigned despite the healthcare trigger';
 END IF;

 -- 3. The status RPC cannot release it. Because assignment is unreachable, the
 --    RPC's own precondition stops the call before the trigger is consulted --
 --    two independent layers, either one of which blocks the release.
 blocked := false; error_code := NULL; error_message := NULL;
 BEGIN
  SELECT public.melrah_dispatch_set_status('00000000-0000-0000-0000-000000000001','RELEASED') INTO result;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_code = RETURNED_SQLSTATE, error_message = MESSAGE_TEXT;
  blocked := error_message LIKE 'Assign a collector before releasing%'
          OR error_message LIKE 'Healthcare dispatch blocked:%';
 END;
 IF NOT blocked THEN
  RAISE EXCEPTION 'FAIL: healthcare RELEASED was not refused by the status RPC (SQLSTATE %, message %)',error_code,error_message;
 END IF;
 IF (SELECT status FROM melrah.work_order WHERE wo_number='MDR-1') <> 'DRAFT' THEN
  RAISE EXCEPTION 'FAIL: healthcare work order left DRAFT';
 END IF;

 -- 4. Cancellation stays available for healthcare: the guard freezes dispatch,
 --    it does not strip the ability to call a job off.
 SELECT public.melrah_dispatch_set_status('00000000-0000-0000-0000-000000000001','CANCELLED') INTO result;
 IF result <> 'CANCELLED' THEN RAISE EXCEPTION 'FAIL: healthcare cancellation RPC failed'; END IF;
 IF (SELECT status FROM melrah.work_order WHERE wo_number='MDR-1') <> 'CANCELLED' THEN
  RAISE EXCEPTION 'FAIL: healthcare work order was not cancelled';
 END IF;

 -- 5. Non-healthcare dispatch is untouched by any of the above.
 SELECT public.melrah_dispatch_set_status('00000000-0000-0000-0000-000000000002','RELEASED') INTO result;
 IF result <> 'RELEASED' THEN RAISE EXCEPTION 'FAIL: coffee RPC progression affected'; END IF;
 IF (SELECT status FROM melrah.work_order WHERE wo_number='COFFEE-1') <> 'RELEASED' THEN
  RAISE EXCEPTION 'FAIL: coffee work order did not progress';
 END IF;

 RAISE NOTICE 'PASS: healthcare INSERT guard rejects pre-assignment, healthcare trigger rejects assignment, status RPC refuses RELEASED and leaves DRAFT, healthcare cancellation allowed, coffee status RPC unaffected';
END $test$;
ROLLBACK;
