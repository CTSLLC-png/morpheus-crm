-- PROPOSAL ONLY: DO NOT APPLY TO PRODUCTION WITHOUT STAGING VERIFICATION.
-- Uses existing melrah.account -> core.tenant and melrah.facility relationships.
-- Credentialing coordinator workflows require a separate authorization design.
-- Verified against existing core.membership data: role is uppercase OWNER.
-- This proposal remains BLOCKED until staging tests and verifier controls pass.
-- Tenant binding uses explicit scoped enrollment, not a global field_resource.tenant_id.
-- All application roles are denied by default; service-side ingestion must be audited.
-- Rerunnable DDL does not mean deployable: existing schema must be diff-reviewed.
begin;
-- Enforce the existing facility -> account -> tenant ownership at the
-- database boundary. SECURITY DEFINER is used only for this invariant:
-- no exposed RPC, no auth/session reliance, fixed search_path.
create or replace function melrah.healthcare_assert_facility_tenant()
returns trigger language plpgsql security definer
set search_path = pg_catalog, melrah
as $body$
begin
  if not exists (
    select 1 from melrah.facility f
    join melrah.account a on a.id = f.account_id
    where f.id = new.facility_id and a.tenant_id = new.tenant_id
  ) then
    raise exception 'Facility does not belong to specified tenant'
      using errcode = '23514';
  end if;
  return new;
end;
$body$;
revoke all on function melrah.healthcare_assert_facility_tenant() from public, anon, authenticated;
-- Prevent account reassignment after a facility is enrolled. Check triggers
-- on account/facility changes below, not just initial enrollment.
create or replace function melrah.healthcare_prevent_facility_tenant_reassignment()
returns trigger language plpgsql security definer
set search_path = pg_catalog, melrah
as $body$
begin
  if exists (
    select 1 from melrah.healthcare_facility_scope s
    join melrah.facility f on f.id = s.facility_id
    where f.account_id = new.id and s.tenant_id <> new.tenant_id
  ) then
    raise exception 'Account tenant change conflicts with enrolled healthcare facility'
      using errcode = '23514';
  end if;
  return new;
end;
$body$;
revoke all on function melrah.healthcare_prevent_facility_tenant_reassignment() from public, anon, authenticated;
create or replace function melrah.healthcare_prevent_facility_account_reassignment()
returns trigger language plpgsql security definer
set search_path = pg_catalog, melrah
as $body$
begin
  if exists (
    select 1 from melrah.healthcare_facility_scope s
    join melrah.account a on a.id = new.account_id
    where s.facility_id = new.id and s.tenant_id <> a.tenant_id
  ) then
    raise exception 'Facility account change conflicts with healthcare tenant'
      using errcode = '23514';
  end if;
  return new;
end;
$body$;
revoke all on function melrah.healthcare_prevent_facility_account_reassignment() from public, anon, authenticated;
-- Scoped facility registry: composite keys ensure clearance tenant cannot be
-- changed independently of its facility. Enrollment must be administered.
create table if not exists melrah.healthcare_facility_scope (
  tenant_id uuid not null references core.tenant(id),
  facility_id uuid not null unique references melrah.facility(id) on delete cascade,
  primary key (tenant_id,facility_id)
);
drop trigger if exists healthcare_facility_scope_tenant_guard on melrah.healthcare_facility_scope;
create trigger healthcare_facility_scope_tenant_guard
before insert or update on melrah.healthcare_facility_scope
for each row execute function melrah.healthcare_assert_facility_tenant();
drop trigger if exists healthcare_account_tenant_change_guard on melrah.account;
create trigger healthcare_account_tenant_change_guard
before update of tenant_id on melrah.account
for each row execute function melrah.healthcare_prevent_facility_tenant_reassignment();
drop trigger if exists healthcare_facility_account_change_guard on melrah.facility;
create trigger healthcare_facility_account_change_guard
before update of account_id on melrah.facility
for each row execute function melrah.healthcare_prevent_facility_account_reassignment();
-- A field resource may serve multiple tenants, but each enrollment is explicit.
-- No client role has write privileges to this mapping.
create table if not exists melrah.healthcare_technician_tenant (
  tenant_id uuid not null references core.tenant(id),
  technician_id uuid not null references melrah.field_resource(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (tenant_id,technician_id)
);
create table if not exists melrah.healthcare_facility_credentialing (
  facility_id uuid primary key references melrah.facility(id) on delete cascade,
  tenant_id uuid not null references core.tenant(id),
  provider_key text not null check (provider_key in
    ('INTELLICENTRICS','SYMPLR','GHX_VENDOR_MATE','GREEN_SECURITY')),
  policy_status text not null default 'UNKNOWN' check (policy_status in ('UNKNOWN','PENDING','VERIFIED','SUSPENDED')),
  policy_verified_at timestamptz,
  policy_expires_at timestamptz,
  policy_reference text,
  updated_at timestamptz not null default now(),
  foreign key (tenant_id,facility_id) references melrah.healthcare_facility_scope(tenant_id,facility_id),
  unique (tenant_id,facility_id,provider_key),
  constraint verified_policy_has_date check (policy_status <> 'VERIFIED' or policy_verified_at is not null)
);
create table if not exists melrah.healthcare_technician_clearance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  facility_id uuid not null references melrah.facility(id) on delete cascade,
  technician_id uuid not null references melrah.field_resource(id),
  provider_key text not null check (provider_key in
    ('INTELLICENTRICS','SYMPLR','GHX_VENDOR_MATE','GREEN_SECURITY')),
  status text not null default 'UNKNOWN' check (status in ('UNKNOWN','PENDING','VERIFIED','EXPIRED','SUSPENDED')),
  verified_at timestamptz,
  expires_at timestamptz,
  verified_by uuid references auth.users(id),
  external_reference text,
  updated_at timestamptz not null default now(),
  unique (facility_id,technician_id),
  foreign key (tenant_id,facility_id,provider_key) references melrah.healthcare_facility_credentialing(tenant_id,facility_id,provider_key),
  foreign key (tenant_id,technician_id) references melrah.healthcare_technician_tenant(tenant_id,technician_id),
  constraint verified_clearance_complete check (status <> 'VERIFIED' or
    (verified_at is not null and expires_at is not null and verified_by is not null))
);
create index if not exists healthcare_clearance_expiry_idx
  on melrah.healthcare_technician_clearance(tenant_id,expires_at);
alter table melrah.healthcare_facility_scope enable row level security;
alter table melrah.healthcare_technician_tenant enable row level security;
alter table melrah.healthcare_facility_credentialing enable row level security;
alter table melrah.healthcare_technician_clearance enable row level security;
-- Restrict reading to authorized tenant managers, not every tenant member.
-- Membership roles must be confirmed before granting permissions.
-- Do NOT grant INSERT/UPDATE/DELETE to authenticated users in this proposal.
drop policy if exists healthcare_facility_credentialing_manager_read on melrah.healthcare_facility_credentialing;
create policy healthcare_facility_credentialing_manager_read
on melrah.healthcare_facility_credentialing for select to authenticated
using (
  exists (
    select 1 from melrah.facility f
    join melrah.account a on a.id=f.account_id
    where f.id=facility_id and a.tenant_id=healthcare_facility_credentialing.tenant_id
      and exists (select 1 from core.membership m
        where m.tenant_id=a.tenant_id and m.user_id=(select auth.uid())
          and m.role = 'OWNER')
  )
);
drop policy if exists healthcare_technician_clearance_manager_read on melrah.healthcare_technician_clearance;
create policy healthcare_technician_clearance_manager_read
on melrah.healthcare_technician_clearance for select to authenticated
using (
  exists (
    select 1 from melrah.facility f
    join melrah.account a on a.id=f.account_id
    where f.id=facility_id and a.tenant_id=healthcare_technician_clearance.tenant_id
      and exists (select 1 from core.membership m
        where m.tenant_id=a.tenant_id and m.user_id=(select auth.uid())
          and m.role = 'OWNER')
  )
);
-- Explicit privileges needed if exposed through Data API. Keep writes server-only.
revoke all on melrah.healthcare_facility_scope from anon, authenticated;
revoke all on melrah.healthcare_technician_tenant from anon, authenticated;
revoke all on melrah.healthcare_facility_credentialing from anon, authenticated;
revoke all on melrah.healthcare_technician_clearance from anon, authenticated;
grant select on melrah.healthcare_facility_credentialing to authenticated;
grant select on melrah.healthcare_technician_clearance to authenticated;
commit;
-- OPEN GATES: validate trigger security, concurrency, idempotent deployment,
-- role privileges and all negative tests in an isolated staging database.
-- Check actual core.membership roles, role grants, facility-account tenant
-- integrity, field_resource tenant ownership (NO direct tenant_id or FK observed),
-- RLS recursion, API schema exposure,
-- and service-side verifier authentication before staging application.
-- SECURITY GAP: verified status cannot yet be trusted for dispatch; no server-side
-- eligibility RPC or evidence provenance/approval workflow exists.
