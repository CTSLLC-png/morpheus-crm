-- PROPOSAL ONLY: DO NOT APPLY TO PRODUCTION WITHOUT STAGING VERIFICATION.
-- Uses existing melrah.account -> core.tenant and melrah.facility relationships.
-- Credentialing coordinator workflows require a separate authorization design.
-- Verified against existing core.membership data: role is uppercase OWNER.
-- This proposal remains BLOCKED until technician-to-tenant binding is enforced.
-- All application roles are denied by default; service-side ingestion must be audited.
begin;
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
  constraint verified_clearance_complete check (status <> 'VERIFIED' or
    (verified_at is not null and expires_at is not null and verified_by is not null))
);
create index if not exists healthcare_clearance_expiry_idx
  on melrah.healthcare_technician_clearance(tenant_id,expires_at);
alter table melrah.healthcare_facility_credentialing enable row level security;
alter table melrah.healthcare_technician_clearance enable row level security;
-- Restrict reading to authorized tenant managers, not every tenant member.
-- Membership roles must be confirmed before granting permissions.
-- Do NOT grant INSERT/UPDATE/DELETE to authenticated users in this proposal.
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
revoke all on melrah.healthcare_facility_credentialing from anon, authenticated;
revoke all on melrah.healthcare_technician_clearance from anon, authenticated;
grant select on melrah.healthcare_facility_credentialing to authenticated;
grant select on melrah.healthcare_technician_clearance to authenticated;
commit;
-- OPEN GATES: check actual core.membership roles, role grants, facility-account tenant
-- integrity, field_resource tenant ownership (NO direct tenant_id or FK observed),
-- RLS recursion, API schema exposure,
-- and service-side verifier authentication before staging application.
-- SECURITY GAP: verified status cannot yet be trusted for dispatch; no server-side
-- eligibility RPC or evidence provenance/approval workflow exists.
