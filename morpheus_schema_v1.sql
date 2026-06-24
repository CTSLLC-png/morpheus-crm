-- =============================================================
--  MORPHEUS CRM — Database Schema v1.0
--  Certified Training Standards · Albany, NY
--  morpheuscrm.com
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
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table cohorts is
  'Training cohort groups. Each cohort belongs to one program source and one lead trainer.';

create index idx_cohorts_trainer    on cohorts(trainer_id);
create index idx_cohorts_status     on cohorts(status);
create index idx_cohorts_source     on cohorts(program_source);


-- ── 3. PARTICIPANTS ───────────────────────────────────────────
-- Extends auth.users for participant self-login
create table participants (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid references auth.users(id) on delete set null,
  cts_id             text not null unique,              -- e.g. "CTS-00187" (auto-generated)
  full_name          text not null,
  dob                date,
  program_source     program_source not null,
  ldss_office        text,                              -- e.g. "LDSS Albany – Workforce Solutions"
  ldss_case_number   text,                              -- e.g. "ALB-WF-2025-1104"
  ldss_caseworker    text,
  enrollment_date    date not null default current_date,
  assigned_trainer   uuid references staff_profiles(id) on delete set null,
  status             participant_status not null default 'Active',
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table participants is
  'Enrolled individuals. Can log in via Morpheus participant portal to run self-directed call sessions.';

create index idx_participants_trainer on participants(assigned_trainer);
create index idx_participants_source  on participants(program_source);
create index idx_participants_status  on participants(status);
create index idx_participants_user    on participants(user_id);

-- Auto-generate CTS ID: CTS-XXXXX (5-digit zero-padded sequence)
create sequence if not exists cts_id_seq start 1 increment 1;

create or replace function generate_cts_id()
returns trigger language plpgsql as $$
begin
  if new.cts_id is null or new.cts_id = '' then
    new.cts_id := 'CTS-' || lpad(nextval('cts_id_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

create trigger trg_generate_cts_id
  before insert on participants
  for each row execute function generate_cts_id();


-- ── 4. COHORT ENROLLMENTS ─────────────────────────────────────
-- Junction: many participants ↔ many cohorts
create table cohort_enrollments (
  id                 uuid primary key default uuid_generate_v4(),
  cohort_id          uuid not null references cohorts(id) on delete cascade,
  participant_id     uuid not null references participants(id) on delete cascade,
  enrolled_at        timestamptz not null default now(),
  enrollment_status  enrollment_status not null default 'Enrolled',

  constraint cohort_enrollments_unique unique (cohort_id, participant_id)
);

comment on table cohort_enrollments is
  'Maps participants to cohorts. A participant may be enrolled in one active cohort at a time.';

create index idx_enrollments_cohort      on cohort_enrollments(cohort_id);
create index idx_enrollments_participant on cohort_enrollments(participant_id);


-- ── 5. CALL SESSIONS ──────────────────────────────────────────
create table call_sessions (
  id              uuid primary key default uuid_generate_v4(),
  participant_id  uuid not null references participants(id) on delete cascade,
  cohort_id       uuid references cohorts(id) on delete set null,
  scored_by       uuid references staff_profiles(id) on delete set null,  -- null = AI-only scoring
  scenario_type   text not null,            -- e.g. "Billing dispute – frustrated customer"
  difficulty      text not null,            -- 'Beginner' | 'Intermediate' | 'Advanced'
  scenario_brief  text not null,            -- AI-generated brief shown to participant
  transcript      jsonb,                    -- [{role, content, timestamp}, ...]
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  status          session_status not null default 'In Progress',
  created_at      timestamptz not null default now()
);

comment on table call_sessions is
  'Each mock call simulation. Transcript stored as JSONB array of turn objects.';

create index idx_sessions_participant on call_sessions(participant_id);
create index idx_sessions_cohort      on call_sessions(cohort_id);
create index idx_sessions_status      on call_sessions(status);
create index idx_sessions_started     on call_sessions(started_at desc);


-- ── 6. CALL SCORES ────────────────────────────────────────────
-- One score record per completed call session
create table call_scores (
  id               uuid primary key default uuid_generate_v4(),
  session_id       uuid not null references call_sessions(id) on delete cascade,
  -- Six rubric categories (0–100 each)
  score_opening    smallint not null check (score_opening    between 0 and 100),
  score_listening  smallint not null check (score_listening  between 0 and 100),
  score_empathy    smallint not null check (score_empathy    between 0 and 100),
  score_resolution smallint not null check (score_resolution between 0 and 100),
  score_policy     smallint not null check (score_policy     between 0 and 100),
  score_closing    smallint not null check (score_closing    between 0 and 100),
  -- Weighted total (computed by AI using matrix weights)
  total_score      smallint not null check (total_score      between 0 and 100),
  ai_feedback      text,                     -- AI-generated narrative feedback
  trainer_notes    text,                     -- Optional human override notes
  scored_at        timestamptz not null default now(),

  constraint call_scores_session_unique unique (session_id)
);

comment on table call_scores is
  'Scoring results for each call session. One row per session. AI fills ai_feedback; trainers may add trainer_notes.';

create index idx_scores_session on call_scores(session_id);


-- ── 7. SCORE MATRIX WEIGHTS ───────────────────────────────────
-- Trainers can adjust category weights from the admin panel
create table score_matrix_weights (
  id                  uuid primary key default uuid_generate_v4(),
  cohort_id           uuid references cohorts(id) on delete cascade,  -- null = global default
  weight_opening      numeric(5,2) not null default 15.00,
  weight_listening    numeric(5,2) not null default 20.00,
  weight_empathy      numeric(5,2) not null default 20.00,
  weight_resolution   numeric(5,2) not null default 25.00,
  weight_policy       numeric(5,2) not null default 10.00,
  weight_closing      numeric(5,2) not null default 10.00,
  updated_by          uuid references staff_profiles(id) on delete set null,
  updated_at          timestamptz not null default now(),

  -- Weights must sum to 100
  constraint weights_sum_100 check (
    weight_opening + weight_listening + weight_empathy +
    weight_resolution + weight_policy + weight_closing = 100.00
  ),
  constraint matrix_weights_cohort_unique unique (cohort_id)
);

comment on table score_matrix_weights is
  'Rubric category weights. A null cohort_id row = global default. Cohort-specific rows override the global.';

-- Insert global default weights
insert into score_matrix_weights (
  cohort_id, weight_opening, weight_listening, weight_empathy,
  weight_resolution, weight_policy, weight_closing
) values (
  null, 15.00, 20.00, 20.00, 25.00, 10.00, 10.00
);


-- ── 8. CERTIFICATIONS ─────────────────────────────────────────
create table certifications (
  id               uuid primary key default uuid_generate_v4(),
  participant_id   uuid not null references participants(id) on delete cascade,
  cert_number      text not null unique,       -- e.g. "MPR-2025-0042"
  issued_date      date not null default current_date,
  qualifying_avg   smallint not null,          -- cumulative avg score at time of issue
  qualifying_calls smallint not null,          -- number of calls counted
  issued_by        uuid references staff_profiles(id) on delete set null,
  status           cert_status not null default 'Issued',
  revoked_reason   text,
  created_at       timestamptz not null default now()
);

comment on table certifications is
  'Issued CX certificates. Auto-triggered when participant hits avg >= 80 over 5+ calls.';

create index idx_certs_participant on certifications(participant_id);
create index idx_certs_number      on certifications(cert_number);

-- Auto-generate cert number: MPR-YYYY-XXXX
create sequence if not exists cert_seq start 1 increment 1;

create or replace function generate_cert_number()
returns trigger language plpgsql as $$
begin
  if new.cert_number is null or new.cert_number = '' then
    new.cert_number := 'MPR-' || extract(year from now())::text
                       || '-' || lpad(nextval('cert_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger trg_generate_cert_number
  before insert on certifications
  for each row execute function generate_cert_number();


-- ── Utility: updated_at auto-stamp ───────────────────────────
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_touch_staff_profiles
  before update on staff_profiles
  for each row execute function touch_updated_at();

create trigger trg_touch_cohorts
  before update on cohorts
  for each row execute function touch_updated_at();

create trigger trg_touch_participants
  before update on participants
  for each row execute function touch_updated_at();


-- ── Views ─────────────────────────────────────────────────────

-- Participant performance summary (used by dashboard + reports)
create or replace view v_participant_performance as
select
  p.id                                          as participant_id,
  p.cts_id,
  p.full_name,
  p.program_source,
  p.status,
  sp.full_name                                  as trainer_name,
  count(cs.id) filter (where cs.status = 'Completed') as total_calls,
  round(avg(sc.total_score))                    as avg_score,
  round(avg(sc.score_opening))                  as avg_opening,
  round(avg(sc.score_listening))                as avg_listening,
  round(avg(sc.score_empathy))                  as avg_empathy,
  round(avg(sc.score_resolution))               as avg_resolution,
  round(avg(sc.score_policy))                   as avg_policy,
  round(avg(sc.score_closing))                  as avg_closing,
  max(sc.total_score)                           as best_score,
  bool_or(cert.id is not null)                  as is_certified
from participants p
left join staff_profiles sp    on sp.id = p.assigned_trainer
left join call_sessions cs     on cs.participant_id = p.id
left join call_scores sc       on sc.session_id = cs.id
left join certifications cert  on cert.participant_id = p.id
  and cert.status = 'Issued'
group by p.id, p.cts_id, p.full_name, p.program_source, p.status, sp.full_name;

comment on view v_participant_performance is
  'Aggregated performance stats per participant. Used by dashboard, profile pages, and progress reports.';


-- Cohort overview (used by dashboard cohort table)
create or replace view v_cohort_overview as
select
  c.id,
  c.name,
  c.program_source,
  c.status,
  c.start_date,
  c.end_date,
  sp.full_name                                  as trainer_name,
  count(distinct ce.participant_id)             as participant_count,
  count(distinct cs.id) filter (where cs.status = 'Completed') as total_calls,
  round(avg(sc.total_score))                    as cohort_avg_score
from cohorts c
left join staff_profiles sp         on sp.id = c.trainer_id
left join cohort_enrollments ce     on ce.cohort_id = c.id
  and ce.enrollment_status = 'Enrolled'
left join call_sessions cs          on cs.cohort_id = c.id
left join call_scores sc            on sc.session_id = cs.id
group by c.id, c.name, c.program_source, c.status, c.start_date, c.end_date, sp.full_name;

comment on view v_cohort_overview is
  'Aggregated cohort stats. Powers the dashboard cohort table.';


-- Certification eligibility check (auto-evaluation)
create or replace view v_certification_eligibility as
select
  p.id                  as participant_id,
  p.cts_id,
  p.full_name,
  count(sc.id)          as completed_calls,
  round(avg(sc.total_score)) as avg_score,
  case
    when count(sc.id) >= 5
     and round(avg(sc.total_score)) >= 80 then true
    else false
  end                   as is_eligible,
  bool_or(cert.id is not null) as already_certified
from participants p
join call_sessions cs   on cs.participant_id = p.id and cs.status = 'Completed'
join call_scores sc     on sc.session_id = cs.id
left join certifications cert on cert.participant_id = p.id and cert.status = 'Issued'
group by p.id, p.cts_id, p.full_name;

comment on view v_certification_eligibility is
  'Shows which participants have met the 80+ avg / 5+ calls certification threshold.';


-- ── Row-Level Security (RLS) ──────────────────────────────────
-- Enable RLS on all tables
alter table staff_profiles        enable row level security;
alter table participants          enable row level security;
alter table cohorts               enable row level security;
alter table cohort_enrollments    enable row level security;
alter table call_sessions         enable row level security;
alter table call_scores           enable row level security;
alter table score_matrix_weights  enable row level security;
alter table certifications        enable row level security;

-- Helper: get current user's role
create or replace function current_user_role()
returns text language sql security definer as $$
  select raw_user_meta_data->>'role'
  from auth.users
  where id = auth.uid();
$$;

-- Helper: get participant id for current user
create or replace function current_participant_id()
returns uuid language sql security definer as $$
  select id from participants where user_id = auth.uid() limit 1;
$$;

-- ── Staff Profiles: staff see all, participants see none ──────
create policy "Staff can read all profiles"
  on staff_profiles for select
  using (current_user_role() in ('super_admin', 'trainer'));

create policy "Staff can update own profile"
  on staff_profiles for update
  using (user_id = auth.uid());

create policy "Super admin full access to staff"
  on staff_profiles for all
  using (current_user_role() = 'super_admin');

-- ── Participants: staff see all, participants see only self ───
create policy "Staff can read all participants"
  on participants for select
  using (current_user_role() in ('super_admin', 'trainer'));

create policy "Participants can read own record"
  on participants for select
  using (user_id = auth.uid());

create policy "Staff can manage participants"
  on participants for all
  using (current_user_role() in ('super_admin', 'trainer'));

-- ── Call Sessions: staff see all, participants see own ────────
create policy "Staff can read all sessions"
  on call_sessions for select
  using (current_user_role() in ('super_admin', 'trainer'));

create policy "Participants can read own sessions"
  on call_sessions for select
  using (participant_id = current_participant_id());

create policy "Participants can create own sessions"
  on call_sessions for insert
  with check (participant_id = current_participant_id());

create policy "Participants can update own active sessions"
  on call_sessions for update
  using (participant_id = current_participant_id() and status = 'In Progress');

-- ── Call Scores: staff see all, participants see own ──────────
create policy "Staff can read all scores"
  on call_scores for select
  using (current_user_role() in ('super_admin', 'trainer'));

create policy "Participants can read own scores"
  on call_scores for select
  using (
    session_id in (
      select id from call_sessions
      where participant_id = current_participant_id()
    )
  );

create policy "Staff can insert and update scores"
  on call_scores for all
  using (current_user_role() in ('super_admin', 'trainer'));

-- Participants can insert their own AI scores
create policy "Participants can insert own scores"
  on call_scores for insert
  with check (
    session_id in (
      select id from call_sessions
      where participant_id = current_participant_id()
    )
  );

-- ── Cohorts: staff manage, participants read enrolled ─────────
create policy "Staff can manage cohorts"
  on cohorts for all
  using (current_user_role() in ('super_admin', 'trainer'));

create policy "Participants can read enrolled cohorts"
  on cohorts for select
  using (
    id in (
      select cohort_id from cohort_enrollments
      where participant_id = current_participant_id()
    )
  );

-- ── Certifications: staff manage, participants read own ───────
create policy "Staff can manage certifications"
  on certifications for all
  using (current_user_role() in ('super_admin', 'trainer'));

create policy "Participants can read own certifications"
  on certifications for select
  using (participant_id = current_participant_id());

-- ── Score Matrix: staff only ──────────────────────────────────
create policy "Staff can manage score matrix"
  on score_matrix_weights for all
  using (current_user_role() in ('super_admin', 'trainer'));

create policy "Participants can read score matrix"
  on score_matrix_weights for select
  using (current_user_role() = 'participant');


-- =============================================================
--  END OF MORPHEUS SCHEMA v1.0
--  Next: Supabase Auth setup → set user metadata role field
--  on signup using a Supabase Edge Function or Auth Hook.
-- =============================================================
