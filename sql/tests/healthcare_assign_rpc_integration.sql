-- Exercise actual assignment RPC with proposed healthcare fail-closed trigger.
BEGIN;
INSERT INTO melrah.work_order(id,wo_number,program_key,status)
VALUES
('00000000-0000-0000-0000-000000000011','MDR-ASSIGN','HEALTHCARE_MDR','DRAFT'),
('00000000-0000-0000-0000-000000000012','COFFEE-ASSIGN','ORGANICS_COFFEE','DRAFT');
DO $test$
DECLARE blocked boolean := false; code text; message text; appointment uuid;
BEGIN
 BEGIN
  SELECT public.melrah_dispatch_assign(
   '00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000098') INTO appointment;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS code = RETURNED_SQLSTATE, message = MESSAGE_TEXT;
  blocked := code = '23514' AND message LIKE 'Healthcare dispatch blocked:%';
 END;
 IF NOT blocked THEN
  RAISE EXCEPTION 'FAIL healthcare assignment did not reach guard (SQLSTATE %, message %)',code,message;
 END IF;
 IF EXISTS(SELECT 1 FROM melrah.service_appointment WHERE work_order_id =
 '00000000-0000-0000-0000-000000000011') THEN
  RAISE EXCEPTION 'FAIL healthcare appointment created after blocked assignment';
 END IF;
 IF EXISTS(SELECT 1 FROM melrah.work_order WHERE wo_number='MDR-ASSIGN'
  AND (assigned_resource_id IS NOT NULL OR status <> 'DRAFT')) THEN
  RAISE EXCEPTION 'FAIL healthcare work order mutated after blocked assignment';
 END IF;
 SELECT public.melrah_dispatch_assign(
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000098') INTO appointment;
 IF appointment IS NULL THEN RAISE EXCEPTION 'FAIL coffee assignment missing appointment'; END IF;
 IF NOT EXISTS(SELECT 1 FROM melrah.work_order WHERE wo_number='COFFEE-ASSIGN'
  AND status='RELEASED' AND assigned_resource_id='00000000-0000-0000-0000-000000000098') THEN
  RAISE EXCEPTION 'FAIL coffee work order not assigned'; END IF;
 IF NOT EXISTS(SELECT 1 FROM melrah.service_appointment WHERE id=appointment
  AND status='DISPATCHED') THEN RAISE EXCEPTION 'FAIL coffee appointment not dispatched'; END IF;
 RAISE NOTICE 'PASS healthcare assignment denied at trigger with no partial writes; coffee assignment and appointment succeed';
END $test$;
ROLLBACK;
