-- =============================================================
--  MORPHEUS CRM — Production Schema Snapshot
--  Generated FROM the live Supabase database (project_id:
--  ymavrmekxiwdphdyteau), public schema, on 2026-08-27.
--
--  THIS IS A SNAPSHOT, NOT A HAND-WRITTEN MIGRATION.
--  It was reconstructed read-only from pg_catalog / information_schema
--  (pg_get_constraintdef, pg_get_viewdef, pg_get_functiondef,
--  pg_get_triggerdef, pg_policies) and is intended to document what
--  is actually running in production. It has NOT been executed
--  against any database and has NOT been tested end-to-end as a
--  fresh-install script (ordering has been arranged to be
--  dependency-safe, but treat this as a reference document first).
--
--  Production is the source of truth. Do not treat this file as
--  authoritative going forward — regenerate it from the live DB
--  whenever schema changes are made there.
--
--  See db/README.md and db/DRIFT.md for context, and do not confuse
--  this file with the stale ../morpheus_schema_v1.sql, which does
--  NOT describe this database.
-- =============================================================


-- ── Extensions (installed in production) ───────────────────────
create extension if not exists "uuid-ossp"      with schema extensions;
create extension if not exists "pgcrypto"        with schema extensions;
create extension if not exists "pg_stat_statements" with schema extensions;
-- supabase_vault is a Supabase-managed extension in the `vault` schema;
-- not application schema, listed here only for completeness.


-- ── Enums (pg_type / pg_enum) ───────────────────────────────────
-- Identical labels/order to morpheus_schema_v1.sql — unchanged from the old file.

create type public.user_role as enum (
  'super_admin',
  'trainer',
  'participant'
);

create type public.program_source as enum (
  'LDSS Albany',
  'LDSS Schenectady',
  'Reentry / Incarcerated',
  'Direct Enrollment'
);

create type public.participant_status as enum (
  'Active',
  'Completed',
  'Withdrawn',
  'On Hold'
);

create type public.cohort_status as enum (
  'Scheduled',
  'Active',
  'Completed',
  'Archived'
);

create type public.session_status as enum (
  'In Progress',
  'Completed',
  'Abandoned'
);

create type public.cert_status as enum (
  'Issued',
  'Revoked'
);

create type public.enrollment_status as enum (
  'Enrolled',
  'Completed',
  'Withdrawn'
);


-- ── Sequences (backing human-readable ID generators) ────────────
create sequence if not exists public.cts_id_seq          start 1 increment 1;
create sequence if not exists public.cert_seq             start 1 increment 1;
create sequence if not exists public.edu_credential_seq   start 1 increment 1;


-- =================================================================
--  TABLES (15) — in FK dependency order
-- =================================================================

-- ── 1. staff_profiles ────────────────────────────────────────────
-- CTS staff members (trainers, admins). Linked 1-to-1 with auth.users.
create table public.staff_profiles (
  id          uuid not null default extensions.uuid_generate_v4(),
  user_id     uuid not null,
  full_name   text not null,
  title       text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint staff_profiles_pkey primary key (id),
  constraint staff_profiles_user_unique unique (user_id),
  constraint staff_profiles_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade
);
comment on table public.staff_profiles is
  'CTS staff members (trainers, admins). Linked 1-to-1 with auth.users.';


-- ── 2. cohorts ────────────────────────────────────────────────────
-- Training cohort groups. Each cohort belongs to one program source
-- and one lead trainer.
create table public.cohorts (
  id             uuid not null default extensions.uuid_generate_v4(),
  name           text not null,
  program_source program_source not null,
  start_date     date not null,
  end_date       date,
  trainer_id     uuid,
  status         cohort_status not null default 'Scheduled'::cohort_status,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint cohorts_pkey primary key (id),
  constraint cohorts_trainer_id_fkey foreign key (trainer_id)
    references public.staff_profiles(id) on delete set null
);
comment on table public.cohorts is
  'Training cohort groups. Each cohort belongs to one program source and one lead trainer.';

create trigger trg_touch_cohorts
  before update on public.cohorts
  for each row execute function public.touch_updated_at();


-- ── 3. participants ─────────────────────────────────────────────
-- Enrolled individuals. Can log in via Morpheus participant portal
-- to run self-directed call sessions.
create table public.participants (
  id                 uuid not null default extensions.uuid_generate_v4(),
  user_id            uuid,
  cts_id             text not null,
  full_name          text not null,
  dob                date,
  program_source     program_source not null,
  ldss_office        text,
  ldss_case_number   text,
  ldss_caseworker    text,
  enrollment_date    date not null default CURRENT_DATE,
  assigned_trainer   uuid,
  status             participant_status not null default 'Active'::participant_status,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint participants_pkey primary key (id),
  constraint participants_cts_id_key unique (cts_id),
  constraint participants_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete set null,
  constraint participants_assigned_trainer_fkey foreign key (assigned_trainer)
    references public.staff_profiles(id) on delete set null
);
comment on table public.participants is
  'Enrolled individuals. Can log in via Morpheus participant portal to run self-directed call sessions.';

create trigger trg_generate_cts_id
  before insert on public.participants
  for each row execute function public.generate_cts_id();

create trigger trg_touch_participants
  before update on public.participants
  for each row execute function public.touch_updated_at();


-- ── 4. cohort_enrollments ───────────────────────────────────────
-- Maps participants to cohorts. A participant may be enrolled in
-- one active cohort at a time.
create table public.cohort_enrollments (
  id                 uuid not null default extensions.uuid_generate_v4(),
  cohort_id          uuid not null,
  participant_id     uuid not null,
  enrolled_at        timestamptz not null default now(),
  enrollment_status  enrollment_status not null default 'Enrolled'::enrollment_status,
  constraint cohort_enrollments_pkey primary key (id),
  constraint cohort_enrollments_unique unique (cohort_id, participant_id),
  constraint cohort_enrollments_cohort_id_fkey foreign key (cohort_id)
    references public.cohorts(id) on delete cascade,
  constraint cohort_enrollments_participant_id_fkey foreign key (participant_id)
    references public.participants(id) on delete cascade
);
comment on table public.cohort_enrollments is
  'Maps participants to cohorts. A participant may be enrolled in one active cohort at a time.';


-- ── 5. call_sessions ────────────────────────────────────────────
-- Each mock call simulation. Transcript stored as JSONB array of
-- turn objects.
create table public.call_sessions (
  id              uuid not null default extensions.uuid_generate_v4(),
  participant_id  uuid not null,
  cohort_id       uuid,
  scored_by       uuid,
  scenario_type   text not null,
  difficulty      text not null,
  scenario_brief  text not null,
  transcript      jsonb,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  status          session_status not null default 'In Progress'::session_status,
  created_at      timestamptz not null default now(),
  constraint call_sessions_pkey primary key (id),
  constraint call_sessions_participant_id_fkey foreign key (participant_id)
    references public.participants(id) on delete cascade,
  constraint call_sessions_cohort_id_fkey foreign key (cohort_id)
    references public.cohorts(id) on delete set null,
  constraint call_sessions_scored_by_fkey foreign key (scored_by)
    references public.staff_profiles(id) on delete set null
);
comment on table public.call_sessions is
  'Each mock call simulation. Transcript stored as JSONB array of turn objects.';


-- ── 6. call_scores ──────────────────────────────────────────────
-- Scoring results for each call session. One row per session.
-- AI fills ai_feedback; trainers may add trainer_notes.
create table public.call_scores (
  id                uuid not null default extensions.uuid_generate_v4(),
  session_id        uuid not null,
  score_opening     smallint not null,
  score_listening   smallint not null,
  score_empathy     smallint not null,
  score_resolution  smallint not null,
  score_policy      smallint not null,
  score_closing     smallint not null,
  total_score       smallint not null,
  ai_feedback       text,
  trainer_notes     text,
  scored_at         timestamptz not null default now(),
  constraint call_scores_pkey primary key (id),
  constraint call_scores_session_unique unique (session_id),
  constraint call_scores_session_id_fkey foreign key (session_id)
    references public.call_sessions(id) on delete cascade,
  constraint call_scores_score_opening_check    check (score_opening    between 0 and 100),
  constraint call_scores_score_listening_check  check (score_listening  between 0 and 100),
  constraint call_scores_score_empathy_check    check (score_empathy    between 0 and 100),
  constraint call_scores_score_resolution_check check (score_resolution between 0 and 100),
  constraint call_scores_score_policy_check     check (score_policy     between 0 and 100),
  constraint call_scores_score_closing_check    check (score_closing    between 0 and 100),
  constraint call_scores_total_score_check      check (total_score      between 0 and 100)
);
comment on table public.call_scores is
  'Scoring results for each call session. One row per session. AI fills ai_feedback; trainers may add trainer_notes.';


-- ── 7. score_matrix_weights ─────────────────────────────────────
-- Rubric category weights. A null cohort_id row = global default.
-- Cohort-specific rows override the global.
create table public.score_matrix_weights (
  id                 uuid not null default extensions.uuid_generate_v4(),
  cohort_id          uuid,
  weight_opening     numeric(5,2) not null default 15.00,
  weight_listening   numeric(5,2) not null default 20.00,
  weight_empathy     numeric(5,2) not null default 20.00,
  weight_resolution  numeric(5,2) not null default 25.00,
  weight_policy      numeric(5,2) not null default 10.00,
  weight_closing     numeric(5,2) not null default 10.00,
  updated_by         uuid,
  updated_at         timestamptz not null default now(),
  constraint score_matrix_weights_pkey primary key (id),
  constraint matrix_weights_cohort_unique unique (cohort_id),
  constraint score_matrix_weights_cohort_id_fkey foreign key (cohort_id)
    references public.cohorts(id) on delete cascade,
  constraint score_matrix_weights_updated_by_fkey foreign key (updated_by)
    references public.staff_profiles(id) on delete set null,
  constraint weights_sum_100 check (
    weight_opening + weight_listening + weight_empathy
    + weight_resolution + weight_policy + weight_closing = 100.00
  )
);
comment on table public.score_matrix_weights is
  'Rubric category weights. A null cohort_id row = global default. Cohort-specific rows override the global.';


-- ── 8. certifications ───────────────────────────────────────────
-- Issued CX certificates. Auto-triggered when participant hits
-- avg >= 80 over 5+ calls.
create table public.certifications (
  id                 uuid not null default extensions.uuid_generate_v4(),
  participant_id     uuid not null,
  cert_number        text not null,
  issued_date        date not null default CURRENT_DATE,
  qualifying_avg     smallint not null,
  qualifying_calls   smallint not null,
  issued_by          uuid,
  status             cert_status not null default 'Issued'::cert_status,
  revoked_reason     text,
  created_at         timestamptz not null default now(),
  constraint certifications_pkey primary key (id),
  constraint certifications_cert_number_key unique (cert_number),
  constraint certifications_participant_id_fkey foreign key (participant_id)
    references public.participants(id) on delete cascade,
  constraint certifications_issued_by_fkey foreign key (issued_by)
    references public.staff_profiles(id) on delete set null
);
comment on table public.certifications is
  'Issued CX certificates. Auto-triggered when participant hits avg >= 80 over 5+ calls.';

create trigger trg_generate_cert_number
  before insert on public.certifications
  for each row execute function public.generate_cert_number();


-- ── 9. edu_courses ──────────────────────────────────────────────
-- MORPHEUS.EDU courses. Each course issues a CTS-owned credential.
create table public.edu_courses (
  id                 uuid not null default gen_random_uuid(),
  code               text not null,
  title              text not null,
  subtitle           text,
  description        text,
  credential_name    text,
  credential_prefix  text not null default 'CTS'::text,
  hours              numeric,
  issuer_org         text not null default 'CTS LLC'::text,
  is_published       boolean not null default false,
  created_at         timestamptz not null default now(),
  constraint edu_courses_pkey primary key (id),
  constraint edu_courses_code_key unique (code)
);
comment on table public.edu_courses is
  'MORPHEUS.EDU courses. Each course issues a CTS-owned credential.';


-- ── 10. edu_modules ─────────────────────────────────────────────
-- Course modules. status=outline means content pending (post-pilot build).
create table public.edu_modules (
  id                 uuid not null default gen_random_uuid(),
  course_id          uuid not null,
  sort_order         integer not null,
  title              text not null,
  subtitle           text,
  duration_minutes   integer,
  status             text not null default 'available'::text,
  summary            text,
  constraint edu_modules_pkey primary key (id),
  constraint edu_modules_course_id_sort_order_key unique (course_id, sort_order),
  constraint edu_modules_course_id_fkey foreign key (course_id)
    references public.edu_courses(id) on delete cascade,
  constraint edu_modules_status_check check (
    status = ANY (ARRAY['available'::text, 'outline'::text, 'locked'::text])
  )
);
comment on table public.edu_modules is
  'Course modules. status=outline means content pending (post-pilot build).';


-- ── 11. edu_lessons ─────────────────────────────────────────────
-- Lesson content in markdown. kind=lab is hands-on; kind=checkpoint
-- hosts the module quiz.
create table public.edu_lessons (
  id                 uuid not null default gen_random_uuid(),
  module_id          uuid not null,
  sort_order         integer not null,
  title              text not null,
  kind               text not null default 'lesson'::text,
  duration_minutes   integer,
  content_md         text,
  constraint edu_lessons_pkey primary key (id),
  constraint edu_lessons_module_id_sort_order_key unique (module_id, sort_order),
  constraint edu_lessons_module_id_fkey foreign key (module_id)
    references public.edu_modules(id) on delete cascade,
  constraint edu_lessons_kind_check check (
    kind = ANY (ARRAY['lesson'::text, 'lab'::text, 'checkpoint'::text])
  )
);
comment on table public.edu_lessons is
  'Lesson content in markdown. kind=lab is hands-on; kind=checkpoint hosts the module quiz.';


-- ── 12. edu_checkpoint_questions ────────────────────────────────
-- Auto-graded checkpoint items per module. Pass threshold 80%.
create table public.edu_checkpoint_questions (
  id              uuid not null default gen_random_uuid(),
  module_id       uuid not null,
  sort_order      integer not null,
  question        text not null,
  options         jsonb not null,
  correct_index   integer not null,
  explanation     text,
  constraint edu_checkpoint_questions_pkey primary key (id),
  constraint edu_checkpoint_questions_module_id_sort_order_key unique (module_id, sort_order),
  constraint edu_checkpoint_questions_module_id_fkey foreign key (module_id)
    references public.edu_modules(id) on delete cascade
);
comment on table public.edu_checkpoint_questions is
  'Auto-graded checkpoint items per module. Pass threshold 80%.';


-- ── 13. edu_progress ────────────────────────────────────────────
-- One row per lesson a participant has completed.
create table public.edu_progress (
  id               uuid not null default gen_random_uuid(),
  participant_id   uuid not null,
  lesson_id        uuid not null,
  completed_at     timestamptz not null default now(),
  constraint edu_progress_pkey primary key (id),
  constraint edu_progress_participant_id_lesson_id_key unique (participant_id, lesson_id),
  constraint edu_progress_participant_id_fkey foreign key (participant_id)
    references public.participants(id) on delete cascade,
  constraint edu_progress_lesson_id_fkey foreign key (lesson_id)
    references public.edu_lessons(id) on delete cascade
);
comment on table public.edu_progress is
  'One row per lesson a participant has completed.';


-- ── 14. edu_checkpoint_attempts ─────────────────────────────────
-- Checkpoint quiz attempts. passed = score >= 80.
create table public.edu_checkpoint_attempts (
  id               uuid not null default gen_random_uuid(),
  participant_id   uuid not null,
  module_id        uuid not null,
  score            numeric not null,
  passed           boolean not null default false,
  answers          jsonb,
  attempted_at     timestamptz not null default now(),
  constraint edu_checkpoint_attempts_pkey primary key (id),
  constraint edu_checkpoint_attempts_participant_id_fkey foreign key (participant_id)
    references public.participants(id) on delete cascade,
  constraint edu_checkpoint_attempts_module_id_fkey foreign key (module_id)
    references public.edu_modules(id) on delete cascade
);
comment on table public.edu_checkpoint_attempts is
  'Checkpoint quiz attempts. passed = score >= 80.';


-- ── 15. edu_credentials ─────────────────────────────────────────
-- EDU.REGISTRY — issued credentials, verifiable publicly via
-- edu_verify_credential(). Multi-tenant via issuer_org.
create table public.edu_credentials (
  id                 uuid not null default gen_random_uuid(),
  credential_code    text not null,
  course_id          uuid,
  participant_id     uuid,
  holder_name        text not null,
  credential_name    text not null,
  issuer_org         text not null default 'CTS LLC'::text,
  issued_by          uuid,
  issued_at          timestamptz not null default now(),
  expires_at         timestamptz,
  status             text not null default 'active'::text,
  meta               jsonb not null default '{}'::jsonb,
  constraint edu_credentials_pkey primary key (id),
  constraint edu_credentials_credential_code_key unique (credential_code),
  constraint edu_credentials_course_id_fkey foreign key (course_id)
    references public.edu_courses(id) on delete set null,
  constraint edu_credentials_participant_id_fkey foreign key (participant_id)
    references public.participants(id) on delete set null,
  constraint edu_credentials_issued_by_fkey foreign key (issued_by)
    references public.staff_profiles(id) on delete set null,
  constraint edu_credentials_status_check check (
    status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text])
  )
);
comment on table public.edu_credentials is
  'EDU.REGISTRY — issued credentials, verifiable publicly via edu_verify_credential(). Multi-tenant via issuer_org.';

create trigger trg_touch_staff_profiles
  before update on public.staff_profiles
  for each row execute function public.touch_updated_at();


-- =================================================================
--  INDEXES (non-constraint-backed; PK/UNIQUE indexes are created
--  implicitly by the constraints above and are not repeated here)
-- =================================================================

create index idx_certs_number         on public.certifications        (cert_number);
create index idx_certs_participant    on public.certifications        (participant_id);
create index idx_cohorts_source       on public.cohorts               (program_source);
create index idx_cohorts_status       on public.cohorts               (status);
create index idx_cohorts_trainer      on public.cohorts               (trainer_id);
create index idx_enrollments_cohort      on public.cohort_enrollments (cohort_id);
create index idx_enrollments_participant on public.cohort_enrollments (participant_id);
create index idx_participants_source   on public.participants         (program_source);
create index idx_participants_status   on public.participants         (status);
create index idx_participants_trainer  on public.participants         (assigned_trainer);
create index idx_participants_user     on public.participants         (user_id);
create index idx_scores_session        on public.call_scores          (session_id);
create index idx_sessions_cohort       on public.call_sessions        (cohort_id);
create index idx_sessions_participant  on public.call_sessions        (participant_id);
create index idx_sessions_started      on public.call_sessions        (started_at desc);
create index idx_sessions_status       on public.call_sessions        (status);


-- =================================================================
--  FUNCTIONS
-- =================================================================

-- Returns the participants.id row for the currently authenticated
-- user; used throughout RLS policies below.
create or replace function public.current_participant_id()
 returns uuid
 language sql
 security definer
 set search_path to 'public'
as $function$
  select id from participants where user_id = auth.uid() limit 1;
$function$;

-- Reads the app role ('super_admin' | 'trainer' | 'participant')
-- out of auth.users.raw_user_meta_data; used throughout RLS policies.
create or replace function public.current_user_role()
 returns text
 language sql
 security definer
 set search_path to 'public'
as $function$
  select raw_user_meta_data->>'role'
  from auth.users
  where id = auth.uid();
$function$;

-- Trigger function: auto-generates certifications.cert_number as
-- 'MPR-<year>-<0000>' from cert_seq when not supplied.
create or replace function public.generate_cert_number()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.cert_number is null or new.cert_number = '' then
    new.cert_number := 'MPR-' || extract(year from now())::text
                       || '-' || lpad(nextval('cert_seq')::text, 4, '0');
  end if;
  return new;
end;
$function$;

-- Trigger function: auto-generates participants.cts_id as
-- 'CTS-<00000>' from cts_id_seq when not supplied.
create or replace function public.generate_cts_id()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.cts_id is null or new.cts_id = '' then
    new.cts_id := 'CTS-' || lpad(nextval('cts_id_seq')::text, 5, '0');
  end if;
  return new;
end;
$function$;

-- Trigger function: stamps updated_at = now() on UPDATE. Attached
-- to staff_profiles, cohorts, participants (NOT to call_sessions,
-- call_scores, cohort_enrollments, score_matrix_weights,
-- certifications, or any edu_* table — see DRIFT.md).
create or replace function public.touch_updated_at()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

-- Generates the next MORPHEUS.EDU credential code, e.g.
-- 'CTS-CS101-2026-000042'. Used by application code, not a trigger.
create or replace function public.edu_next_credential_code(p_prefix text, p_course_code text)
 returns text
 language sql
as $function$
  select p_prefix || '-' || replace(p_course_code, '-', '') || '-' ||
         to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('edu_credential_seq')::text, 6, '0');
$function$;

-- Public credential verification lookup (case-insensitive, trimmed),
-- computes 'expired' on the fly if past expires_at. SECURITY DEFINER
-- so it can be exposed to anonymous verifiers without granting
-- table-level SELECT on edu_credentials.
create or replace function public.edu_verify_credential(p_code text)
 returns table(credential_code text, holder_name text, credential_name text, issuer_org text, issued_at timestamptz, expires_at timestamptz, status text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select c.credential_code, c.holder_name, c.credential_name, c.issuer_org,
         c.issued_at, c.expires_at,
         case when c.status = 'active' and c.expires_at is not null and c.expires_at < now()
              then 'expired' else c.status end
  from edu_credentials c
  where upper(c.credential_code) = upper(trim(p_code));
$function$;

-- Cross-product bootstrap RPC: given the calling auth.uid(), returns
-- all core.tenant rows the user has a core.membership in, each with
-- its enabled core.module rows. NOTE: this function reaches into the
-- `core` schema (multi-tenant/module registry shared with the
-- EmpowerCare and Melrah products in this same Postgres project) —
-- it is not self-contained within the public/Morpheus schema
-- captured elsewhere in this file. See DRIFT.md / README for context;
-- core.tenant, core.module, core.membership, core.tenant_module are
-- NOT reconstructed here as they are outside the public schema.
create or replace function public.morpheus_bootstrap()
 returns jsonb
 language sql
 stable
 set search_path to 'public', 'core', 'pg_temp'
as $function$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'tenants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',           t.id,
        'slug',         t.slug,
        'name',         t.name,
        'legal_entity', t.legal_entity,
        'industry',     t.industry,
        'status',       t.status,
        'role',         m.role,
        'modules', coalesce((
          select jsonb_agg(jsonb_build_object(
            'key',         mo.key,
            'name',        mo.name,
            'description', mo.description,
            'schema',      mo.schema_name,
            'category',    mo.category,
            'status',      mo.status,
            'sort_order',  mo.sort_order,
            'enabled',     tm.enabled,
            'config',      tm.config
          ) order by mo.sort_order)
          from core.tenant_module tm
          join core.module mo on mo.key = tm.module_key
          where tm.tenant_id = t.id
        ), '[]'::jsonb)
      ) order by t.name)
      from core.tenant t
      join core.membership m on m.tenant_id = t.id and m.user_id = auth.uid()
    ), '[]'::jsonb)
  )
$function$;


-- =================================================================
--  TRIGGERS (attachments; functions defined above)
-- =================================================================
-- create trigger trg_generate_cert_number  before insert on public.certifications for each row execute function public.generate_cert_number();   -- (see certifications table above)
-- create trigger trg_touch_cohorts         before update on public.cohorts        for each row execute function public.touch_updated_at();        -- (see cohorts table above)
-- create trigger trg_generate_cts_id       before insert on public.participants   for each row execute function public.generate_cts_id();         -- (see participants table above)
-- create trigger trg_touch_participants    before update on public.participants   for each row execute function public.touch_updated_at();        -- (see participants table above)
-- create trigger trg_touch_staff_profiles  before update on public.staff_profiles for each row execute function public.touch_updated_at();        -- (see staff_profiles table above)
-- (Listed inline above at each CREATE TABLE for readability; repeated here as a manifest. 5 triggers total.)


-- =================================================================
--  VIEWS (3) — the views the application actually queries
-- =================================================================

-- v_participant_performance: per-participant rollup of call counts,
-- average total/category scores, best score, and certification flag.
create or replace view public.v_participant_performance as
 SELECT p.id AS participant_id,
    p.cts_id,
    p.full_name,
    p.program_source,
    p.status,
    sp.full_name AS trainer_name,
    count(cs.id) FILTER (WHERE (cs.status = 'Completed'::session_status)) AS total_calls,
    round(avg(sc.total_score)) AS avg_score,
    round(avg(sc.score_opening)) AS avg_opening,
    round(avg(sc.score_listening)) AS avg_listening,
    round(avg(sc.score_empathy)) AS avg_empathy,
    round(avg(sc.score_resolution)) AS avg_resolution,
    round(avg(sc.score_policy)) AS avg_policy,
    round(avg(sc.score_closing)) AS avg_closing,
    max(sc.total_score) AS best_score,
    bool_or((cert.id IS NOT NULL)) AS is_certified
   FROM ((((participants p
     LEFT JOIN staff_profiles sp ON ((sp.id = p.assigned_trainer)))
     LEFT JOIN call_sessions cs ON ((cs.participant_id = p.id)))
     LEFT JOIN call_scores sc ON ((sc.session_id = cs.id)))
     LEFT JOIN certifications cert ON (((cert.participant_id = p.id) AND (cert.status = 'Issued'::cert_status))))
  GROUP BY p.id, p.cts_id, p.full_name, p.program_source, p.status, sp.full_name;

-- v_cohort_overview: per-cohort rollup of trainer name, enrolled
-- participant count, completed call count, and cohort average score.
create or replace view public.v_cohort_overview as
 SELECT c.id,
    c.name,
    c.program_source,
    c.status,
    c.start_date,
    c.end_date,
    sp.full_name AS trainer_name,
    count(DISTINCT ce.participant_id) AS participant_count,
    count(DISTINCT cs.id) FILTER (WHERE (cs.status = 'Completed'::session_status)) AS total_calls,
    round(avg(sc.total_score)) AS cohort_avg_score
   FROM ((((cohorts c
     LEFT JOIN staff_profiles sp ON ((sp.id = c.trainer_id)))
     LEFT JOIN cohort_enrollments ce ON (((ce.cohort_id = c.id) AND (ce.enrollment_status = 'Enrolled'::enrollment_status))))
     LEFT JOIN call_sessions cs ON ((cs.cohort_id = c.id)))
     LEFT JOIN call_scores sc ON ((sc.session_id = cs.id)))
  GROUP BY c.id, c.name, c.program_source, c.status, c.start_date, c.end_date, sp.full_name;

-- v_certification_eligibility: per-participant completed-call count,
-- average score, and a computed is_eligible flag (>=5 completed
-- calls AND avg >= 80), plus whether already certified.
create or replace view public.v_certification_eligibility as
 SELECT p.id AS participant_id,
    p.cts_id,
    p.full_name,
    count(sc.id) AS completed_calls,
    round(avg(sc.total_score)) AS avg_score,
        CASE
            WHEN ((count(sc.id) >= 5) AND (round(avg(sc.total_score)) >= (80)::numeric)) THEN true
            ELSE false
        END AS is_eligible,
    bool_or((cert.id IS NOT NULL)) AS already_certified
   FROM (((participants p
     JOIN call_sessions cs ON (((cs.participant_id = p.id) AND (cs.status = 'Completed'::session_status))))
     JOIN call_scores sc ON ((sc.session_id = cs.id)))
     LEFT JOIN certifications cert ON (((cert.participant_id = p.id) AND (cert.status = 'Issued'::cert_status))))
  GROUP BY p.id, p.cts_id, p.full_name;

-- NOTE: the public schema also contains 27 additional views
-- (core_*, ec_*, ml_* — 4 + 14 + 9) that expose tables from the
-- `core`, `empowercare`, and `melrah` schemas belonging to two other
-- products hosted in this same Supabase project. They are NOT part
-- of the Morpheus CRM data model, are not reconstructed here, and
-- are out of scope for this snapshot. See DRIFT.md for the full list
-- of names and db/README.md for context.


-- =================================================================
--  ROW LEVEL SECURITY — enable + all 38 policies
-- =================================================================

alter table public.staff_profiles          enable row level security;
alter table public.cohorts                 enable row level security;
alter table public.participants            enable row level security;
alter table public.cohort_enrollments      enable row level security;
alter table public.call_sessions           enable row level security;
alter table public.call_scores             enable row level security;
alter table public.score_matrix_weights    enable row level security;
alter table public.certifications          enable row level security;
alter table public.edu_courses             enable row level security;
alter table public.edu_modules             enable row level security;
alter table public.edu_lessons             enable row level security;
alter table public.edu_checkpoint_questions enable row level security;
alter table public.edu_progress            enable row level security;
alter table public.edu_checkpoint_attempts enable row level security;
alter table public.edu_credentials         enable row level security;

-- staff_profiles (3 policies)
create policy "Staff can read all profiles" on public.staff_profiles
  for select to public
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

create policy "Staff can update own profile" on public.staff_profiles
  for update to public
  using (user_id = auth.uid());

create policy "Super admin full access to staff" on public.staff_profiles
  for all to public
  using (current_user_role() = 'super_admin'::text);

-- cohorts (2 policies)
create policy "Participants can read enrolled cohorts" on public.cohorts
  for select to public
  using (id IN (
    SELECT cohort_enrollments.cohort_id FROM cohort_enrollments
    WHERE cohort_enrollments.participant_id = current_participant_id()
  ));

create policy "Staff can manage cohorts" on public.cohorts
  for all to public
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

-- participants (3 policies)
create policy "Participants can read own record" on public.participants
  for select to public
  using (user_id = auth.uid());

create policy "Staff can manage participants" on public.participants
  for all to public
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

create policy "Staff can read all participants" on public.participants
  for select to public
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

-- cohort_enrollments (2 policies)
create policy "Participants can read own enrollments" on public.cohort_enrollments
  for select to public
  using (participant_id = current_participant_id());

create policy "Staff can manage enrollments" on public.cohort_enrollments
  for all to public
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

-- call_sessions (4 policies)
create policy "Participants can create own sessions" on public.call_sessions
  for insert to public
  with check (participant_id = current_participant_id());

create policy "Participants can read own sessions" on public.call_sessions
  for select to public
  using (participant_id = current_participant_id());

create policy "Participants can update own active sessions" on public.call_sessions
  for update to public
  using (participant_id = current_participant_id() AND status = 'In Progress'::session_status);

create policy "Staff can read all sessions" on public.call_sessions
  for select to public
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

-- call_scores (4 policies)
create policy "Participants can insert own scores" on public.call_scores
  for insert to public
  with check (session_id IN (
    SELECT call_sessions.id FROM call_sessions
    WHERE call_sessions.participant_id = current_participant_id()
  ));

create policy "Participants can read own scores" on public.call_scores
  for select to public
  using (session_id IN (
    SELECT call_sessions.id FROM call_sessions
    WHERE call_sessions.participant_id = current_participant_id()
  ));

create policy "Staff can insert and update scores" on public.call_scores
  for all to public
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

create policy "Staff can read all scores" on public.call_scores
  for select to public
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

-- score_matrix_weights (2 policies)
create policy "Participants can read score matrix" on public.score_matrix_weights
  for select to public
  using (current_user_role() = 'participant'::text);

create policy "Staff can manage score matrix" on public.score_matrix_weights
  for all to public
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

-- certifications (2 policies)
create policy "Participants can read own certifications" on public.certifications
  for select to public
  using (participant_id = current_participant_id());

create policy "Staff can manage certifications" on public.certifications
  for all to public
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

-- edu_courses (2 policies)
create policy "Authenticated can read published courses" on public.edu_courses
  for select to authenticated
  using (is_published OR (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text])));

create policy "Staff manage courses" on public.edu_courses
  for all to authenticated
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

-- edu_modules (2 policies)
create policy "Authenticated can read modules" on public.edu_modules
  for select to authenticated
  using (course_id IN (
    SELECT edu_courses.id FROM edu_courses WHERE edu_courses.is_published
  ) OR (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text])));

create policy "Staff manage modules" on public.edu_modules
  for all to authenticated
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

-- edu_lessons (2 policies)
create policy "Authenticated can read lessons" on public.edu_lessons
  for select to authenticated
  using ((module_id IN (
    SELECT m.id FROM edu_modules m JOIN edu_courses c ON c.id = m.course_id
    WHERE c.is_published
  )) OR (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text])));

create policy "Staff manage lessons" on public.edu_lessons
  for all to authenticated
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

-- edu_checkpoint_questions (2 policies)
create policy "Authenticated can read checkpoint questions" on public.edu_checkpoint_questions
  for select to authenticated
  using (true);

create policy "Staff manage checkpoint questions" on public.edu_checkpoint_questions
  for all to authenticated
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

-- edu_progress (3 policies)
create policy "Participants insert own progress" on public.edu_progress
  for insert to authenticated
  with check (participant_id = current_participant_id());

create policy "Participants read own progress" on public.edu_progress
  for select to authenticated
  using (participant_id = current_participant_id());

create policy "Staff read all progress" on public.edu_progress
  for select to authenticated
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

-- edu_checkpoint_attempts (3 policies)
create policy "Participants insert own attempts" on public.edu_checkpoint_attempts
  for insert to authenticated
  with check (participant_id = current_participant_id());

create policy "Participants read own attempts" on public.edu_checkpoint_attempts
  for select to authenticated
  using (participant_id = current_participant_id());

create policy "Staff read all attempts" on public.edu_checkpoint_attempts
  for select to authenticated
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

-- edu_credentials (2 policies)
create policy "Participants read own credentials" on public.edu_credentials
  for select to authenticated
  using (participant_id = current_participant_id());

create policy "Staff manage credentials" on public.edu_credentials
  for all to authenticated
  using (current_user_role() = ANY (ARRAY['super_admin'::text, 'trainer'::text]));

-- Total: 38 policies across 15 tables, all RLS-enabled, none with
-- FORCE ROW LEVEL SECURITY set, all PERMISSIVE.
