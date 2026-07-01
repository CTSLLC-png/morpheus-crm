-- =============================================================
--  MORPHEUS CRM — Database Schema v1.0
--  Certified Training Standards · Albany, NY
--  morpheuscr.com
--
--  Paste this entire file into the Supabase SQL Editor and run.
--  Order matters — run top to bottom.
-- =============================================================


-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";


-- ── Clean slate (dev only — remove before production) ────────
drop table if exists certifications       cascade;
drop table if exists call_scores          cascade;
drop table if exists call_sessions        cascade;
drop table if exists cohort_enrollments   cascade;
drop table if exists cohorts              cascade;
drop table if exists participants         cascade;
drop table if exists staff_profiles       cascade;
drop table if exists score_matrix_weights cascade;
drop type  if exists user_role            cascade;
drop type  if exists program_source       cascade;
drop type  if exists participant_status   cascade;
drop type  if exists cohort_status        cascade;
drop type  if exists session_status       cascade;
drop type  if exists cert_status          cascade;
drop type  if exists enrollment_status    cascade;


-- ── Enums ─────────────────────────────────────────────────────
create type user_role as enum (
  'super_admin',   -- CTS owner / full access
  'trainer',       -- Staff trainer — manages cohorts & scores
  'participant'    -- Enrolled individual — self-service sessions
);

create type program_source as enum (
  'LDSS Albany',
  'LDSS Schenectady',
  'Reentry / Incarcerated',
  'Direct Enrollment'
);

create type participant_status as enum (
  'Active',
  'Completed',
  'Withdrawn',
  'On Hold'
);

create type cohort_status as enum (
  'Scheduled',
  'Active',
  'Completed',
  'Archived'
);

create type session_status as enum (
  'In Progress',
  'Completed',
  'Abandoned'
);

create type cert_status as enum (
  'Issued',
  'Revoked'
);

create type enrollment_status as enum (
  'Enrolled',
  'Completed',
  'Withdrawn'
);


-- ── 1. STAFF PROFILES ─────────────────────────────────────────
-- Extends Supabase auth.users for staff (trainers + admins)
create table staff_profiles (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  full_name   text not null,
  title       text,                         -- e.g. "Lead Trainer", "Program Director"
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint staff_profiles_user_unique unique (user_id)
);

comment on table staff_profiles is
  'CTS staff members (trainers, admins). Linked 1-to-1 with auth.users.';


-- ── 2. COHORTS ────────────────────────────────────────────────
create table cohorts (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null,                         -- e.g. "Spring 2025 – Cohort A"
  program_source program_source not null,
  start_date     date not null,
  end_date       date,
  trainer_id     uuid references staff_profiles(id) on delete set null,
  status         cohort_status not null default 'Scheduled',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint cohorts_trainer_ref check (trainer_id IS NOT NULL OR status = 'Scheduled')
);

comment on table cohorts is 'Cohorts represent groups of participants enrolled in a program.';


-- ── 3. PARTICIPANTS ────────────────────────────────────────────
create table participants (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  cts_id             text not null unique,              -- e.g. "CTS-00001", auto-generated
  full_name          text not null,
  dob                date not null,
  program_source     program_source not null,
  ldss_office        text,                              -- e.g. "LDSS Albany"
  ldss_case_number   text,
  ldss_caseworker    text,
  assigned_trainer   uuid references staff_profiles(id) on delete set null,
  status             participant_status not null default 'Active',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint participants_user_unique unique (user_id)
);

comment on table participants is 'Participants enrolled in Morpheus training programs.';


-- ── 4. COHORT ENROLLMENTS ─────────────────────────────────────
create table cohort_enrollments (
  id             uuid primary key default uuid_generate_v4(),
  participant_id uuid not null references participants(id) on delete cascade,
  cohort_id      uuid not null references cohorts(id) on delete cascade,
  status         enrollment_status not null default 'Enrolled',
  enrolled_at    timestamptz not null default now(),
  completed_at   timestamptz,
  updated_at     timestamptz not null default now(),

  constraint cohort_enrollments_unique unique (participant_id, cohort_id)
);

comment on table cohort_enrollments is 'Enrollment of participants in cohorts.';


-- ── 5. CALL SESSIONS ───────────────────────────────────────────
create table call_sessions (
  id             uuid primary key default uuid_generate_v4(),
  participant_id uuid not null references participants(id) on delete cascade,
  cohort_id      uuid references cohorts(id) on delete set null,
  trainer_id     uuid references staff_profiles(id) on delete set null,
  scenario_id    text,                      -- e.g. "SC-0042", from AI
  status         session_status not null default 'In Progress',
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  duration_secs  integer,
  ai_prompt      text,                      -- Stored for audit
  ai_response    text,
  participant_notes text,
  trainer_notes   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table call_sessions is 'AI-powered mock call sessions.';


-- ── 6. CALL SCORES ─────────────────────────────────────────────
create table call_scores (
  id               uuid primary key default uuid_generate_v4(),
  session_id       uuid not null references call_sessions(id) on delete cascade,
  participant_id   uuid not null references participants(id) on delete cascade,
  category         text not null,           -- e.g. "opening", "problem_discovery", "closing"
  raw_score        integer not null,        -- 0–100
  weighted_score   integer,                 -- raw × weight%, computed
  feedback         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table call_scores is 'Scores from individual call sessions, per category.';


-- ── 7. SCORE MATRIX WEIGHTS ────────────────────────────────────
create table score_matrix_weights (
  id         uuid primary key default uuid_generate_v4(),
  cohort_id  uuid references cohorts(id) on delete cascade,  -- NULL = global weights
  opening    integer not null check (opening >= 0 and opening <= 100),
  problem_discovery integer not null check (problem_discovery >= 0 and problem_discovery <= 100),
  rapport integer not null check (rapport >= 0 and rapport <= 100),
  solution_focus integer not null check (solution_focus >= 0 and solution_focus <= 100),
  closing integer not null check (closing >= 0 and closing <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint weights_sum_to_100 check (
    opening + problem_discovery + rapport + solution_focus + closing = 100
  ),
  constraint global_weights_unique unique (cohort_id) where cohort_id IS NULL
);

comment on table score_matrix_weights is 'Scoring weights (percentages) for categories. NULL cohort_id = global defaults.';


-- ── 8. CERTIFICATIONS ─────────────────────────────────────────
create table certifications (
  id                  uuid primary key default uuid_generate_v4(),
  participant_id      uuid not null references participants(id) on delete cascade,
  cert_number         text not null unique,    -- e.g. "CERT-0001"
  status              cert_status not null default 'Issued',
  qualifying_avg      integer not null,        -- e.g. 85
  qualifying_calls    integer not null,        -- e.g. 5
  issued_by           uuid references staff_profiles(id) on delete set null,
  issued_at           timestamptz not null default now(),
  revoked_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table certifications is 'Issued certificates for participants who meet thresholds.';
