BEGIN;
INSERT INTO melrah.healthcare_facility_scope(tenant_id,facility_id)
 VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
INSERT INTO melrah.healthcare_technician_tenant(tenant_id,technician_id)
 VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004');
INSERT INTO melrah.healthcare_facility_credentialing
(tenant_id,facility_id,provider_key,policy_status,policy_verified_at,policy_expires_at)
VALUES('00000000-0000-0000-0000-000000000001',
'00000000-0000-0000-0000-000000000003','SYMPLR','VERIFIED',
now()-interval '2 days',now()+interval '30 days');
INSERT INTO melrah.healthcare_facility_requirement
(id,tenant_id,facility_id,provider_key,requirement_key,description)
VALUES('00000000-0000-0000-0000-000000000006',
'00000000-0000-0000-0000-000000000001',
'00000000-0000-0000-0000-000000000003','SYMPLR','BADGE','Badge');
INSERT INTO melrah.healthcare_credential_evidence
(requirement_id,tenant_id,facility_id,provider_key,technician_id,status,
 verified_at,expires_at,verified_by,source_system,external_reference)
VALUES('00000000-0000-0000-0000-000000000006',
'00000000-0000-0000-0000-000000000001',
'00000000-0000-0000-0000-000000000003','SYMPLR',
'00000000-0000-0000-0000-000000000004','VERIFIED',
now()-interval '2 days',now()+interval '30 days',
'00000000-0000-0000-0000-000000000020','SYMPLR','badge-123');
INSERT INTO melrah.work_order
(id,tenant_id,account_id,facility_id,scheduled_for,program_key,status,wo_number)
VALUES('00000000-0000-0000-0000-000000000011',
'00000000-0000-0000-0000-000000000001',
'00000000-0000-0000-0000-000000000002',
'00000000-0000-0000-0000-000000000003',
current_date+3,'ORGANICS_COFFEE','DRAFT','COFFEE-ASSIGN');
DO $test$
DECLARE code text;message text;before_wo jsonb;after_wo jsonb;aid uuid;
BEGIN
 SELECT to_jsonb(w) INTO before_wo FROM melrah.work_order w
 WHERE id='00000000-0000-0000-0000-000000000005';
 IF NOT melrah.healthcare_evidence_eligible(
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000004')
 THEN RAISE EXCEPTION 'Test fixture evidence unexpectedly invalid'; END IF;
 BEGIN
  PERFORM public.melrah_dispatch_assign(
   '00000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000004');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
 END;
 IF code IS DISTINCT FROM '23514' OR message NOT LIKE 'Healthcare dispatch blocked:%'
 THEN RAISE EXCEPTION 'Real RPC bypassed guard: % %',code,message; END IF;
 SELECT to_jsonb(w) INTO after_wo FROM melrah.work_order w
 WHERE id='00000000-0000-0000-0000-000000000005';
 IF before_wo IS DISTINCT FROM after_wo THEN
  RAISE EXCEPTION 'Blocked healthcare RPC modified work order'; END IF;
 IF EXISTS(SELECT 1 FROM melrah.service_appointment
  WHERE work_order_id='00000000-0000-0000-0000-000000000005')
 THEN RAISE EXCEPTION 'Blocked healthcare RPC created appointment'; END IF;
 SELECT public.melrah_dispatch_assign(
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000004') INTO aid;
 IF aid IS NULL OR NOT EXISTS(
  SELECT 1 FROM melrah.service_appointment
  WHERE id=aid AND status='DISPATCHED')
 THEN RAISE EXCEPTION 'Coffee assignment regression'; END IF;
 RAISE NOTICE 'PASS real schema + exact assignment RPC: MDR blocked without writes, coffee allowed';
END $test$;
ROLLBACK;
