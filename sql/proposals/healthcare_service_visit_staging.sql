-- PROPOSAL ONLY. Do not apply to production without staging tests and security review.
-- Healthcare customer-scoped scheduling, isolated from coffee/cannabis dispatch.
create schema if not exists healthcare;

create table if not exists healthcare.service_visit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  client_key text not null check (length(trim(client_key)) > 0),
  facility_id uuid not null references melrah.facility(id),
  rule_key text not null,
  service_date date not null,
  start_time time,
  end_time time,
  resource_id uuid references melrah.field_resource(id),
  status text not null default 'PLANNED'
    check (status in ('PLANNED','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED','EXCEPTION')),
  coverage_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, client_key, rule_key, service_date),
  check (start_time is null or end_time is null or start_time < end_time)
);

create index if not exists healthcare_visit_calendar
  on healthcare.service_visit (tenant_id, client_key, service_date);
create index if not exists healthcare_visit_resource
  on healthcare.service_visit (resource_id, service_date);

alter table healthcare.service_visit enable row level security;
-- Intentionally no public/anon/authenticated policies or grants.
-- DO NOT expose healthcare schema to Data API until authorization design,
-- membership/client assignments, service RPCs, and cross-client negative tests pass.
-- Server-side migration runners only; do not place service-role keys in frontend.

-- Credentialing integration requirement:
-- service_visit must not transition to ASSIGNED/IN_PROGRESS until a separate
-- authorization service verifies technician qualification AND client/facility
-- credentialing clearance for the actual visit date. This is NOT yet enforced.
-- See docs/healthcare-credentialing-access-spec.md.
