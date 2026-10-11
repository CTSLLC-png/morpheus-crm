-- PROPOSAL ONLY. Read-only eligibility function for disposable testing.
-- NOT an exposed RPC; no grants to anon/authenticated. No production deployment.
-- Fail closed: missing, expired, revoked, wrong-tenant or ambiguous evidence denies.
-- Evaluates the service date at a conservative UTC day boundary; hospital-local
-- timezone and exact appointment timestamp must be resolved before authorization.
CREATE OR REPLACE FUNCTION melrah.healthcare_evidence_eligible(
 p_work_order_id uuid,
 p_technician_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, melrah
AS $body$
DECLARE
 wo record;
 pol record;
 required_count integer;
 matched_count integer;
BEGIN
 SELECT w.id,w.tenant_id,w.account_id,w.facility_id,w.scheduled_for
 INTO wo FROM melrah.work_order w
 WHERE w.id=p_work_order_id AND w.program_key='HEALTHCARE_MDR';
 IF NOT FOUND OR p_technician_id IS NULL OR wo.scheduled_for IS NULL
    OR wo.tenant_id IS NULL OR wo.account_id IS NULL OR wo.facility_id IS NULL
 THEN RETURN false; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM melrah.facility f JOIN melrah.account a ON a.id=f.account_id
   JOIN melrah.healthcare_facility_scope fs
     ON fs.facility_id=f.id AND fs.tenant_id=a.tenant_id
   WHERE f.id=wo.facility_id AND a.id=wo.account_id AND a.tenant_id=wo.tenant_id
 ) THEN RETURN false; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM melrah.healthcare_technician_tenant tt
   JOIN melrah.field_resource fr ON fr.id=tt.technician_id
   WHERE tt.tenant_id=wo.tenant_id AND tt.technician_id=p_technician_id
     AND fr.active IS TRUE
 ) THEN RETURN false; END IF;
 SELECT fc.provider_key INTO pol
 FROM melrah.healthcare_facility_credentialing fc
 WHERE fc.tenant_id=wo.tenant_id AND fc.facility_id=wo.facility_id
   AND fc.policy_status='VERIFIED'
   AND fc.policy_verified_at IS NOT NULL
   AND fc.policy_expires_at IS NOT NULL
   AND fc.policy_verified_at <= (wo.scheduled_for::timestamp AT TIME ZONE 'UTC')
   AND fc.policy_expires_at > ((wo.scheduled_for+1)::timestamp AT TIME ZONE 'UTC');
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT count(*) INTO required_count
 FROM melrah.healthcare_facility_requirement req
 WHERE req.tenant_id=wo.tenant_id AND req.facility_id=wo.facility_id
   AND req.provider_key=pol.provider_key AND req.active AND req.required;
 IF required_count=0 THEN RETURN false; END IF;
 -- Every active required credential must have exactly one verified valid record.
 -- Duplicate/conflicting evidence fails closed until a deterministic verifier
 -- reconciliation policy is approved.
 SELECT count(*) INTO matched_count
 FROM melrah.healthcare_facility_requirement req
 WHERE req.tenant_id=wo.tenant_id AND req.facility_id=wo.facility_id
   AND req.provider_key=pol.provider_key AND req.active AND req.required
   AND (SELECT count(*) FROM melrah.healthcare_credential_evidence e
     WHERE e.requirement_id=req.id AND e.tenant_id=wo.tenant_id
       AND e.facility_id=wo.facility_id AND e.provider_key=pol.provider_key
       AND e.technician_id=p_technician_id)=1
   AND EXISTS (
     SELECT 1 FROM melrah.healthcare_credential_evidence e
     WHERE e.requirement_id=req.id AND e.tenant_id=wo.tenant_id
       AND e.facility_id=wo.facility_id AND e.provider_key=pol.provider_key
       AND e.technician_id=p_technician_id AND e.status='VERIFIED'
       AND e.verified_by IS NOT NULL
       AND nullif(trim(e.source_system),'') IS NOT NULL
       AND nullif(trim(e.external_reference),'') IS NOT NULL
       AND e.verified_at IS NOT NULL AND e.expires_at IS NOT NULL
       AND e.verified_at <= (wo.scheduled_for::timestamp AT TIME ZONE 'UTC')
       AND e.expires_at > ((wo.scheduled_for+1)::timestamp AT TIME ZONE 'UTC')
   );
 RETURN matched_count=required_count;
END
$body$;
REVOKE ALL ON FUNCTION melrah.healthcare_evidence_eligible(uuid,uuid)
FROM PUBLIC, anon, authenticated;
