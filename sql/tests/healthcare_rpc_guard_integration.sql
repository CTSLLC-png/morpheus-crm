-- Transactional tests of the actual public.melrah_dispatch_set_status function.
BEGIN;
INSERT INTO melrah.work_order(id,wo_number,program_key,status,assigned_resource_id)
VALUES
('00000000-0000-0000-0000-000000000001','MDR-1','HEALTHCARE_MDR','DRAFT',
 '00000000-0000-0000-0000-000000000098'),
('00000000-0000-0000-0000-000000000002','COFFEE-1','ORGANICS_COFFEE','DRAFT',
 '00000000-0000-0000-0000-000000000099');
DO $test$
DECLARE blocked boolean; result text; error_code text; error_message text;
BEGIN
 blocked:=false;
 BEGIN
  SELECT public.melrah_dispatch_set_status('00000000-0000-0000-0000-000000000001','RELEASED') INTO result;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_code = RETURNED_SQLSTATE, error_message = MESSAGE_TEXT;
  blocked := error_code = '23514' AND error_message LIKE 'Healthcare dispatch blocked:%';
 END;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL: healthcare RELEASED did not fail specifically at healthcare trigger (SQLSTATE %, message %)',error_code,error_message; END IF;
 SELECT public.melrah_dispatch_set_status('00000000-0000-0000-0000-000000000001','CANCELLED') INTO result;
 IF result <> 'CANCELLED' THEN RAISE EXCEPTION 'FAIL: healthcare cancellation RPC failed'; END IF;
 SELECT public.melrah_dispatch_set_status('00000000-0000-0000-0000-000000000002','RELEASED') INTO result;
 IF result <> 'RELEASED' THEN RAISE EXCEPTION 'FAIL: coffee RPC progression affected'; END IF;
 IF (SELECT status FROM melrah.work_order WHERE wo_number='COFFEE-1') <> 'RELEASED'
 THEN RAISE EXCEPTION 'FAIL: coffee work order did not progress'; END IF;
 RAISE NOTICE 'PASS: MDR status RPC rejected by healthcare trigger, MDR cancellation allowed, coffee status RPC unaffected';
END $test$;
ROLLBACK;
