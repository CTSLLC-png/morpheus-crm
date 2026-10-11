-- Disposable parents matching the columns and constraints needed by
-- real MDR proposal DDL. Never apply to production.
CREATE SCHEMA core;
CREATE SCHEMA auth;
CREATE SCHEMA melrah;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
CREATE TABLE core.tenant(id uuid PRIMARY KEY);
CREATE TABLE core.membership(tenant_id uuid,user_id uuid,role text);
CREATE TABLE melrah.account(id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES core.tenant(id));
CREATE TABLE melrah.facility(id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES melrah.account(id));
CREATE TABLE melrah.field_resource(id uuid PRIMARY KEY,active boolean NOT NULL DEFAULT true);
CREATE TABLE melrah.work_order(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,account_id uuid NOT NULL,
 facility_id uuid NOT NULL,scheduled_for date,program_key text,status text,assigned_resource_id uuid);
CREATE FUNCTION core.member_of(uuid) RETURNS boolean LANGUAGE sql STABLE AS 'SELECT true';
INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000020');
INSERT INTO core.tenant VALUES('00000000-0000-0000-0000-000000000001');
INSERT INTO melrah.account VALUES('00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000001');
INSERT INTO melrah.facility VALUES('00000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-000000000002');
INSERT INTO melrah.field_resource VALUES('00000000-0000-0000-0000-000000000004',true);
INSERT INTO melrah.work_order VALUES('00000000-0000-0000-0000-000000000005',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000003',current_date+3,
 'HEALTHCARE_MDR','DRAFT',NULL);
