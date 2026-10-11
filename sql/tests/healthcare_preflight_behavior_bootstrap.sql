-- Disposable behavioral fixture. Real preflight SQL; dependencies are
-- deterministic test doubles, NOT production schema or verifier logic.
CREATE SCHEMA melrah;
CREATE SCHEMA core;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE TABLE melrah.work_order(
 id uuid PRIMARY KEY,tenant_id uuid,facility_id uuid,account_id uuid,
 program_key text,status text,assigned_resource_id uuid);
CREATE TABLE melrah.healthcare_access_exception(
 id uuid PRIMARY KEY,requirement_id uuid);
CREATE TABLE melrah.healthcare_access_exclusion(
 tenant_id uuid,facility_id uuid,technician_id uuid,active boolean,effective_at timestamptz);
CREATE TABLE public.healthcare_preflight_test_flags(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 member_ok boolean NOT NULL DEFAULT true,
 evidence_ok boolean NOT NULL DEFAULT true,
 exception_ok boolean NOT NULL DEFAULT true);
INSERT INTO public.healthcare_preflight_test_flags(singleton) VALUES(true);
CREATE FUNCTION core.member_of(uuid) RETURNS boolean LANGUAGE sql STABLE AS
 'SELECT member_ok FROM public.healthcare_preflight_test_flags WHERE singleton';
CREATE FUNCTION melrah.healthcare_lock_facility_policy(uuid,uuid)
 RETURNS void LANGUAGE sql AS 'SELECT';
CREATE FUNCTION melrah.healthcare_lock_dispatch_safety_scope(uuid,uuid,uuid)
 RETURNS void LANGUAGE sql AS 'SELECT';
CREATE FUNCTION melrah.healthcare_evidence_eligible(uuid,uuid)
 RETURNS boolean LANGUAGE sql STABLE AS
 'SELECT evidence_ok FROM public.healthcare_preflight_test_flags WHERE singleton';
CREATE FUNCTION melrah.healthcare_exception_lock_for_dispatch(uuid)
 RETURNS melrah.healthcare_access_exception LANGUAGE plpgsql AS $$
 DECLARE e melrah.healthcare_access_exception%rowtype;
 BEGIN
  SELECT * INTO e FROM melrah.healthcare_access_exception WHERE id=$1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hospital exception unavailable for dispatch' USING ERRCODE='23514'; END IF;
  RETURN e;
 END $$;
CREATE FUNCTION melrah.healthcare_exception_matches_visit(uuid,uuid,uuid,uuid,timestamptz)
 RETURNS boolean LANGUAGE sql STABLE AS
 'SELECT exception_ok FROM public.healthcare_preflight_test_flags WHERE singleton';
INSERT INTO melrah.work_order VALUES(
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-000000000004',
 'HEALTHCARE_MDR','DRAFT',NULL);
INSERT INTO melrah.healthcare_access_exception VALUES(
 '00000000-0000-0000-0000-000000000006',
 '00000000-0000-0000-0000-000000000007');
