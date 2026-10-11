BEGIN;
INSERT INTO melrah.work_order(id,wo_number,program_key,status,tenant_id,account_id,facility_id,scheduled_for)
VALUES('00000000-0000-0000-0000-000000000021','MDR-INTEGRATED','HEALTHCARE_MDR',
 'DRAFT','00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000003',current_date+2);
DO $test$
DECLARE state text;message text; before_row jsonb;after_row jsonb;appt_count integer;
BEGIN
 SELECT to_jsonb(w) INTO before_row FROM melrah.work_order w
 WHERE id='00000000-0000-0000-0000-000000000021';
 SELECT count(*) INTO appt_count FROM melrah.service_appointment
 WHERE work_order_id='00000000-0000-0000-0000-000000000021';
 BEGIN
  PERFORM melrah.healthcare_dispatch_preflight_disabled(
   '00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000098');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
 END;
 IF state IS DISTINCT FROM '23514' OR
  message IS DISTINCT FROM
  'Healthcare dispatch remains disabled: integrated preflight is non-authorizing' THEN
  RAISE EXCEPTION 'Unexpected preflight result [%] %',state,message;
 END IF;
 state:=NULL;message:=NULL;
 BEGIN
  PERFORM public.melrah_dispatch_assign(
   '00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000098');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
 END;
 IF state IS DISTINCT FROM '23514' OR
  message NOT LIKE 'Healthcare dispatch blocked:%' THEN
  RAISE EXCEPTION 'Assignment RPC bypassed healthcare guard [%] %',state,message;
 END IF;
 SELECT to_jsonb(w) INTO after_row FROM melrah.work_order w
 WHERE id='00000000-0000-0000-0000-000000000021';
 IF before_row IS DISTINCT FROM after_row THEN
  RAISE EXCEPTION 'Preflight/RPC combination mutated work order';
 END IF;
 IF (SELECT count(*) FROM melrah.service_appointment
  WHERE work_order_id='00000000-0000-0000-0000-000000000021')<>appt_count THEN
  RAISE EXCEPTION 'Preflight/RPC combination created appointment';
 END IF;
 RAISE NOTICE 'PASS: eligible preflight still disabled; actual assignment RPC blocked by guard with no writes';
END $test$;
ROLLBACK;
