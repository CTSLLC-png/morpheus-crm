-- Transactional tests of the actual public.melrah_dispatch_set_status function.
BEGIN;
INSERT INTO melrah.work_order(id,wo_number,program_key,status,assigned_resource_id)
VALUES
('00000000-0000-0000-0000-000000000001','MDR-1','HEALTHCARE_MDR','DRAFT',NULL),
('00000000-0000-0000-0000-000000000002','COFFEE-1','ORGANICS_COFFEE','DRAFT',
 '00000000-0000-0000-0000-000000000099');
DO $test$
DECLARE blocked boolean; result text;
BEGIN
 blocked:=false;
 BEGIN
  SELECT public.melrah_dispatch_set_status('00000000-0000-0000-0000-000000000001','RELEASED') INTO result;
 EXCEPTION WHEN OTHERS THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL: healthcare RELEASED via RPC allowed'; END IF;
 SELECT public.melrah_dispatch_set_status('00000000-0000-0000-0000-000000000001','CANCELLED') INTO result;
 IF result <> 'CANCELLED' THEN RAISE EXCEPTION 'FAIL: healthcare cancellation RPC failed'; END IF;
 SELECT public.melrah_dispatch_set_status('00000000-0000-0000-0000-000000000002','RELEASED') INTO result;
 IF result <> 'RELEASED' THEN RAISE EXCEPTION 'FAIL: coffee RPC progression affected'; END IF;
 IF (SELECT status FROM melrah.work_order WHERE wo_number='COFFEE-1') <> 'RELEASED'
 THEN RAISE EXCEPTION 'FAIL: coffee work order did not progress'; END IF;
 RAISE NOTICE 'PASS: MDR status RPC denied, MDR cancellation allowed, coffee status RPC unaffected';
END $test$;
ROLLBACK;
