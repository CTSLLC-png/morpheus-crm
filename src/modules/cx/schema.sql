-- =============================================================
--  MORPHEUS CRM — CX Module Schema
--  Certified Training Standards · Albany, NY · morpheuscr.com
--
--  Tables:
--    cx_feedback_entries    — raw CX feedback, PII-scrubbed at intake
--    cx_improvement_plans   — AI-generated improvement plans (draft → published)
--
--  Prerequisites:
--    Run morpheus_schema_v1.sql FIRST if you want the optional
--    participant_id / cohort_id foreign keys wired up. They are
--    attached conditionally at the bottom of section 4, so this file
--    also runs cleanly on a project that does not have them yet.
--
--  Paste this entire file into the Supabase SQL Editor and run.
--  Order matters — run top to bottom. Safe to re-run (idempotent).
-- =============================================================


-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";


-- =============================================================
--  1. SHARED ORG-SCOPING PREREQUISITES
--
--  NOTE: Morpheus v1 has no multi-tenancy — there is no org_id
--  column anywhere in morpheus_schema_v1.sql. The CX module is
--  specified as org_id-scoped, so the org primitives are defined
--  here. They are deliberately module-neutral (no cx_ prefix) so
--  other modules can adopt the same scoping without a rewrite.
--
--  org_members is ALSO the authoritative source of role for RLS.
--  It is not user-writable, unlike auth.users.user_metadata, which
--  the existing app reads for role (see src/lib/supabase.js
--  getUserRole). user_metadata can be rewritten by the user via
--  supabase.auth.updateUser({ data: { role: 'super_admin' } }), so
--  any RLS policy that trusts it is trivially escalatable. Policies
--  below read org_members instead.
-- =============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('super_admin', 'trainer', 'participant');
  end if;
end $$;


create table if not exists organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table organizations is
  'Tenants. Every CX row is scoped to exactly one organization.';


create table if not exists org_members (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        user_role not null default 'participant',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint org_members_unique unique (org_id, user_id)
);

comment on table org_members is
  'Authoritative org membership AND role. RLS reads role from here, '
  'never from auth.users.user_metadata (which the user can rewrite).';

create index if not exists idx_org_members_user on org_members (user_id);
create index if not exists idx_org_members_org  on org_members (org_id);


-- ── Membership helpers ───────────────────────────────────────
--  SECURITY DEFINER so they read org_members as the table owner.
--  The owner bypasses RLS (we never FORCE row level security on
--  org_members — see the note in section 6), which is what stops
--  the org_members policies below from recursing into themselves.

create or replace function cx_current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from org_members where user_id = auth.uid();
$$;

comment on function cx_current_org_ids is
  'Every org the calling user belongs to.';


create or replace function cx_is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from org_members
    where user_id = auth.uid()
      and org_id  = target_org
  );
$$;


create or replace function cx_is_super_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from org_members
    where user_id = auth.uid()
      and org_id  = target_org
      and role    = 'super_admin'
  );
$$;

comment on function cx_is_super_admin is
  'True when the caller is a super_admin OF THAT SPECIFIC ORG. '
  'A super_admin of org A has no elevated rights in org B.';


-- ── updated_at touch trigger ─────────────────────────────────
create or replace function cx_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- =============================================================
--  2. ENUMS
-- =============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cx_plan_status') then
    create type cx_plan_status as enum (
      'draft',      -- AI wrote it; not yet reviewed by a human
      'approved',   -- super_admin signed off; not yet visible downstream
      'published',  -- live
      'archived'    -- retired
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'cx_feedback_channel') then
    create type cx_feedback_channel as enum (
      'web_form',
      'post_call_survey',
      'trainer_intake',
      'email',
      'phone',
      'in_person',
      'import'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'cx_sentiment') then
    create type cx_sentiment as enum ('positive', 'neutral', 'negative', 'mixed');
  end if;
end $$;


-- =============================================================
--  3. CX IMPROVEMENT PLANS
--  Created before cx_feedback_entries because feedback rows point
--  back at the plan that consumed them.
-- =============================================================

create table if not exists cx_improvement_plans (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid not null references organizations(id) on delete cascade,
  cohort_id           uuid,                       -- FK attached in section 4 if cohorts exists

  title               text not null,
  status              cx_plan_status not null default 'draft',

  -- Window of feedback this plan was generated from
  period_start        date,
  period_end          date,
  feedback_count      integer not null default 0 check (feedback_count >= 0),
  source_feedback_ids uuid[] not null default '{}',

  -- Structured AI output (see generateCXPlan.ts CX_PLAN_SCHEMA)
  executive_summary   text,
  themes              jsonb not null default '[]'::jsonb,
  recommendations     jsonb not null default '[]'::jsonb,
  metrics             jsonb not null default '[]'::jsonb,

  -- Provenance / audit
  model               text,
  prompt_version      text,
  generated_by        uuid references auth.users(id) on delete set null,
  generated_at        timestamptz not null default now(),

  -- Review trail (stamped by trigger, not by the client)
  reviewed_by         uuid references auth.users(id) on delete set null,
  reviewed_at         timestamptz,
  published_at        timestamptz,
  archived_at         timestamptz,
  review_notes        text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint cx_plans_period_ordered
    check (period_start is null or period_end is null or period_start <= period_end),
  constraint cx_plans_themes_is_array
    check (jsonb_typeof(themes) = 'array'),
  constraint cx_plans_recs_is_array
    check (jsonb_typeof(recommendations) = 'array'),
  constraint cx_plans_metrics_is_array
    check (jsonb_typeof(metrics) = 'array')
);

comment on table cx_improvement_plans is
  'AI-generated CX improvement plans. Always written as draft; only a '
  'super_admin of the owning org can move a plan out of draft.';

create index if not exists idx_cx_plans_org        on cx_improvement_plans (org_id);
create index if not exists idx_cx_plans_status     on cx_improvement_plans (org_id, status);
create index if not exists idx_cx_plans_generated  on cx_improvement_plans (org_id, generated_at desc);

drop trigger if exists trg_cx_plans_touch on cx_improvement_plans;
create trigger trg_cx_plans_touch
  before update on cx_improvement_plans
  for each row execute function cx_touch_updated_at();


-- =============================================================
--  4. CX FEEDBACK ENTRIES
-- =============================================================

create table if not exists cx_feedback_entries (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid not null references organizations(id) on delete cascade,
  participant_id      uuid,                       -- FK attached below if participants exists
  cohort_id           uuid,                       -- FK attached below if cohorts exists

  channel             cx_feedback_channel not null default 'web_form',
  submitted_at        timestamptz not null default now(),
  submitted_by        uuid references auth.users(id) on delete set null,

  -- Post-scrub comment text. Nothing writes the raw original here —
  -- see submitFeedback.ts; scrubbing happens before the insert.
  comment             text not null check (length(btrim(comment)) > 0),
  rating              smallint check (rating between 1 and 5),
  sentiment           cx_sentiment,
  topic_tags          text[] not null default '{}',

  -- Defensive PII pass telemetry (second layer behind clean intake)
  pii_scrubbed        boolean not null default false,
  pii_redaction_count integer not null default 0 check (pii_redaction_count >= 0),

  -- Batching cursor: null processed_at == not yet fed to a plan
  processed_at        timestamptz,
  processed_plan_id   uuid references cx_improvement_plans(id) on delete set null,

  source_metadata     jsonb not null default '{}'::jsonb,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint cx_feedback_processed_consistent
    check ((processed_at is null) = (processed_plan_id is null))
);

comment on table cx_feedback_entries is
  'CX feedback. comment is stored post-scrub; pii_redaction_count > 0 '
  'means the defensive pass caught something clean intake should have.';

comment on column cx_feedback_entries.processed_at is
  'Null = unprocessed. getUnprocessedFeedback() batches on this.';

create index if not exists idx_cx_feedback_org        on cx_feedback_entries (org_id);
create index if not exists idx_cx_feedback_submitted  on cx_feedback_entries (org_id, submitted_at desc);
create index if not exists idx_cx_feedback_cohort     on cx_feedback_entries (cohort_id) where cohort_id is not null;
-- Partial index: the batching query only ever reads unprocessed rows.
create index if not exists idx_cx_feedback_unprocessed
  on cx_feedback_entries (org_id, submitted_at)
  where processed_at is null;

drop trigger if exists trg_cx_feedback_touch on cx_feedback_entries;
create trigger trg_cx_feedback_touch
  before update on cx_feedback_entries
  for each row execute function cx_touch_updated_at();


-- ── Optional FKs into the v1 schema ──────────────────────────
--  Attached only when those tables are present, so this file runs
--  standalone on a fresh project.

do $$
begin
  if to_regclass('public.participants') is not null
     and not exists (select 1 from pg_constraint where conname = 'cx_feedback_participant_fk') then
    alter table cx_feedback_entries
      add constraint cx_feedback_participant_fk
      foreign key (participant_id) references participants(id) on delete set null;
  end if;

  if to_regclass('public.cohorts') is not null then
    if not exists (select 1 from pg_constraint where conname = 'cx_feedback_cohort_fk') then
      alter table cx_feedback_entries
        add constraint cx_feedback_cohort_fk
        foreign key (cohort_id) references cohorts(id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'cx_plans_cohort_fk') then
      alter table cx_improvement_plans
        add constraint cx_plans_cohort_fk
        foreign key (cohort_id) references cohorts(id) on delete set null;
    end if;
  end if;
end $$;


-- =============================================================
--  5. STATUS TRANSITION ENFORCEMENT
--
--  RLS decides WHO may change status (section 6). This trigger
--  decides WHICH transitions are legal at all, and stamps the
--  review trail server-side so the client cannot forge it.
-- =============================================================

create or replace function cx_enforce_plan_transition()
returns trigger
language plpgsql
as $$
begin
  -- A published plan is a frozen record. Only status may move.
  if old.status = 'published' and new.status = 'published' then
    if (new.title, new.executive_summary, new.themes,
        new.recommendations, new.metrics, new.source_feedback_ids)
       is distinct from
       (old.title, old.executive_summary, old.themes,
        old.recommendations, old.metrics, old.source_feedback_ids) then
      raise exception
        'CX plan %: published plans are immutable. Archive it and generate a new plan.',
        old.id
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status is distinct from old.status then
    -- Legal edges only.
    if not (
      (old.status = 'draft'     and new.status in ('approved', 'archived')) or
      (old.status = 'approved'  and new.status in ('published', 'draft', 'archived')) or
      (old.status = 'published' and new.status = 'archived')
    ) then
      raise exception 'CX plan %: illegal status transition % -> %',
        old.id, old.status, new.status
        using errcode = 'check_violation';
    end if;

    -- Stamp the review trail server-side.
    if new.status = 'approved' then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    elsif new.status = 'published' then
      new.published_at := now();
      if new.reviewed_by is null then
        new.reviewed_by := auth.uid();
        new.reviewed_at := coalesce(new.reviewed_at, now());
      end if;
    elsif new.status = 'archived' then
      new.archived_at := now();
    elsif new.status = 'draft' then
      -- Sent back for rework: clear the sign-off.
      new.reviewed_by  := null;
      new.reviewed_at  := null;
      new.published_at := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cx_plans_transition on cx_improvement_plans;
create trigger trg_cx_plans_transition
  before update on cx_improvement_plans
  for each row execute function cx_enforce_plan_transition();


-- =============================================================
--  6. ROW LEVEL SECURITY
--
--  Precedent note: morpheus_schema_v1.sql ships ZERO policies even
--  though morpheus_production_checklist.sql step 4 asserts
--  rowsecurity = true for cohort_enrollments and friends — that
--  check fails today. The pattern established here (enable RLS,
--  scope every policy through a SECURITY DEFINER org helper, gate
--  privileged writes on org_members.role) is what those v1 tables
--  should be backfilled with.
--
--  We deliberately do NOT `force row level security`. FORCE would
--  apply RLS to the table owner, and the SECURITY DEFINER helpers
--  above run as the owner — forcing it makes the org_members
--  policies recurse into themselves. service_role still bypasses
--  RLS either way (it carries BYPASSRLS).
-- =============================================================

alter table organizations        enable row level security;
alter table org_members          enable row level security;
alter table cx_feedback_entries  enable row level security;
alter table cx_improvement_plans enable row level security;


-- ── organizations ────────────────────────────────────────────
drop policy if exists orgs_select_own on organizations;
create policy orgs_select_own on organizations
  for select to authenticated
  using (cx_is_org_member(id));

drop policy if exists orgs_update_super_admin on organizations;
create policy orgs_update_super_admin on organizations
  for update to authenticated
  using (cx_is_super_admin(id))
  with check (cx_is_super_admin(id));


-- ── org_members ──────────────────────────────────────────────
-- Read your own row, or any row in an org you super_admin.
drop policy if exists org_members_select on org_members;
create policy org_members_select on org_members
  for select to authenticated
  using (user_id = auth.uid() or cx_is_super_admin(org_id));

-- Membership and role are super_admin-only writes. This is what
-- makes org_members trustworthy as the RLS role source: a member
-- cannot promote themselves the way they can with user_metadata.
drop policy if exists org_members_write_super_admin on org_members;
create policy org_members_write_super_admin on org_members
  for all to authenticated
  using (cx_is_super_admin(org_id))
  with check (cx_is_super_admin(org_id));


-- ── cx_feedback_entries ──────────────────────────────────────
drop policy if exists cx_feedback_select_org on cx_feedback_entries;
create policy cx_feedback_select_org on cx_feedback_entries
  for select to authenticated
  using (cx_is_org_member(org_id));

-- Any member of the org may submit feedback into their own org.
drop policy if exists cx_feedback_insert_org on cx_feedback_entries;
create policy cx_feedback_insert_org on cx_feedback_entries
  for insert to authenticated
  with check (cx_is_org_member(org_id));

-- Updates are for the batching cursor (processed_at / processed_plan_id)
-- and trainer triage (sentiment, tags). Cannot move a row across orgs.
drop policy if exists cx_feedback_update_org on cx_feedback_entries;
create policy cx_feedback_update_org on cx_feedback_entries
  for update to authenticated
  using (cx_is_org_member(org_id))
  with check (cx_is_org_member(org_id));

drop policy if exists cx_feedback_delete_super_admin on cx_feedback_entries;
create policy cx_feedback_delete_super_admin on cx_feedback_entries
  for delete to authenticated
  using (cx_is_super_admin(org_id));


-- ── cx_improvement_plans ─────────────────────────────────────
drop policy if exists cx_plans_select_org on cx_improvement_plans;
create policy cx_plans_select_org on cx_improvement_plans
  for select to authenticated
  using (cx_is_org_member(org_id));

-- Generation path: any org member may write a plan, but only as draft.
drop policy if exists cx_plans_insert_org on cx_improvement_plans;
create policy cx_plans_insert_org on cx_improvement_plans
  for insert to authenticated
  with check (cx_is_org_member(org_id) and status = 'draft');

-- Members may edit a draft, as long as it STAYS a draft. The
-- `with check (status = 'draft')` is the half that blocks a member
-- from writing status = 'approved' / 'published'.
drop policy if exists cx_plans_update_draft_member on cx_improvement_plans;
create policy cx_plans_update_draft_member on cx_improvement_plans
  for update to authenticated
  using (cx_is_org_member(org_id) and status = 'draft')
  with check (cx_is_org_member(org_id) and status = 'draft');

-- Super admins of the org may update anything, including status.
drop policy if exists cx_plans_update_super_admin on cx_improvement_plans;
create policy cx_plans_update_super_admin on cx_improvement_plans
  for update to authenticated
  using (cx_is_super_admin(org_id))
  with check (cx_is_super_admin(org_id));

-- Belt and braces. Permissive policies OR together, so the two
-- policies above already deny a member's draft -> approved write
-- (member policy fails WITH CHECK, super_admin policy fails USING).
-- This RESTRICTIVE policy ANDs on top and states the rule directly:
-- touching a non-draft row, or producing a non-draft row, requires
-- super_admin. It cannot be defeated by adding another permissive
-- policy later.
drop policy if exists cx_plans_status_gate on cx_improvement_plans;
create policy cx_plans_status_gate on cx_improvement_plans
  as restrictive for update to authenticated
  using  (status = 'draft' or cx_is_super_admin(org_id))
  with check (status = 'draft' or cx_is_super_admin(org_id));

drop policy if exists cx_plans_insert_gate on cx_improvement_plans;
create policy cx_plans_insert_gate on cx_improvement_plans
  as restrictive for insert to authenticated
  with check (status = 'draft' or cx_is_super_admin(org_id));

drop policy if exists cx_plans_delete_super_admin on cx_improvement_plans;
create policy cx_plans_delete_super_admin on cx_improvement_plans
  for delete to authenticated
  using (cx_is_super_admin(org_id));


-- =============================================================
--  7. VERIFICATION
--  Run after deploying. Mirrors morpheus_production_checklist.sql.
-- =============================================================

-- All four tables exist and have RLS on:
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--     and tablename in ('organizations','org_members',
--                       'cx_feedback_entries','cx_improvement_plans');
--   Expected: 4 rows, rowsecurity = true for each.

-- Policies present:
--   select tablename, policyname, permissive, cmd from pg_policies
--   where schemaname = 'public' and tablename like 'cx_%'
--   order by tablename, policyname;
--   Expected: cx_plans_status_gate and cx_plans_insert_gate show
--   permissive = 'RESTRICTIVE'; everything else 'PERMISSIVE'.

-- Manual gate test (as a non-super_admin member of the org):
--   update cx_improvement_plans set status = 'approved' where id = '<draft id>';
--   Expected: UPDATE 0 (RLS silently filters the row out).
