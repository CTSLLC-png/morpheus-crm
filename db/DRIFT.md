<title>DRIFT.md</title>

# Schema Drift: `morpheus_schema_v1.sql` vs. production

Comparison of the repo file `morpheus_schema_v1.sql` (8 tables, 7 enums, 0 views, 0
functions, 0 triggers, 0 RLS) against `db/production_snapshot.sql`, generated
read-only from the live Supabase project `ymavrmekxiwdphdyteau` on 2026-08-27
(15 tables, 7 enums, 3 relevant views, 8 functions, 5 triggers, 38 RLS policies).
Facts only — no recommendations.

---

## 1. Tables the repo file describes, and what differs

### `staff_profiles`
No column drift. Columns, types, defaults, nullability, and constraint names
(`staff_profiles_pkey`, `staff_profiles_user_unique`, `staff_profiles_user_id_fkey`
`on delete cascade`) match the repo file exactly.
Drift that exists anyway: production has RLS enabled with 3 policies ("Staff can
read all profiles", "Staff can update own profile", "Super admin full access to
staff"); the repo file defines no RLS at all for this table.

### `cohorts`
- New column not in repo file: `notes text` (nullable).
- Missing constraint: the repo file's `check (trainer_id IS NOT NULL OR status = 'Scheduled')`
  (`cohorts_trainer_ref`) does not exist in production — `cohorts` has only
  `cohorts_pkey` and `cohorts_trainer_id_fkey`, no check constraint.
- New trigger not in repo file: `trg_touch_cohorts` (`before update`, calls
  `touch_updated_at()`) — the repo file relied on the column default only, with
  no mechanism to bump `updated_at` on UPDATE.
- RLS: 2 policies in production ("Participants can read enrolled cohorts",
  "Staff can manage cohorts"); none in the repo file.

### `participants`
- `user_id`: repo file is `not null` with a `unique` constraint
  (`participants_user_unique`); production has `user_id` **nullable**, and
  `participants_user_unique` does not exist in production at all — no
  uniqueness is enforced on `user_id`.
- `user_id` FK action: repo file is `on delete cascade`; production is
  `on delete set null`.
- `dob`: repo file is `not null`; production is nullable.
- New column not in repo file: `enrollment_date date not null default CURRENT_DATE`.
- New column not in repo file: `notes text` (nullable).
- New trigger not in repo file: `trg_generate_cts_id` (`before insert`) —
  auto-generates `cts_id` as `'CTS-' || lpad(nextval('cts_id_seq')::text, 5, '0')`
  when not supplied. The repo file's comment says cts_id is "auto-generated" but
  defines no generator; production actually implements it via this trigger plus
  a `cts_id_seq` sequence, neither of which appears in the repo file.
- New trigger not in repo file: `trg_touch_participants` (`before update`,
  `touch_updated_at()`).
- RLS: 3 policies in production ("Participants can read own record", "Staff can
  manage participants", "Staff can read all participants"); none in the repo file.

### `cohort_enrollments`
- Column renamed: repo file's `status enrollment_status` is `enrollment_status
  enrollment_status` in production (same enum type, different column name).
- Missing columns: repo file's `completed_at timestamptz` and `updated_at
  timestamptz not null default now()` do not exist in production at all.
- Unique constraint present in both (`unique(cohort_id, participant_id)` /
  `unique(participant_id, cohort_id)` — same columns, declared in the opposite
  order, functionally identical).
- RLS: 2 policies in production ("Participants can read own enrollments",
  "Staff can manage enrollments"); none in the repo file.

### `call_sessions`
Materially different shape — this is a redesign, not an incremental change:
- `trainer_id` → renamed `scored_by` (same target table `staff_profiles`,
  `on delete set null`).
- `scenario_id text` (nullable) → replaced by `scenario_type text not null` and
  `difficulty text not null` (two new required columns; `scenario_id` does not
  exist in production).
- New required column not in repo file: `scenario_brief text not null`.
- New column not in repo file: `transcript jsonb` (nullable) — stores the full
  call transcript as a JSON array.
- Missing columns: repo file's `duration_secs integer`, `ai_prompt text`,
  `ai_response text`, `participant_notes text`, `trainer_notes text`, and
  `updated_at timestamptz` do not exist in production. (`trainer_notes` reappears,
  differently scoped, on `call_scores` — see below.)
- RLS: 4 policies in production ("Participants can create own sessions",
  "Participants can read own sessions", "Participants can update own active
  sessions", "Staff can read all sessions"); none in the repo file.

### `call_scores`
Materially different shape — production pivots categories into columns and
enforces one row per session, where the repo file modeled one row per
category per session:
- Repo file: `participant_id uuid not null` (denormalized FK), `category text
  not null`, `raw_score integer not null`, `weighted_score integer`, `feedback
  text`, `created_at`, `updated_at` — no uniqueness constraint on `session_id`,
  so multiple rows per session (one per category) were the intended model.
- Production: no `participant_id`, `category`, `raw_score`, `weighted_score`,
  `feedback`, `created_at`, or `updated_at` columns at all. Instead:
  `score_opening`, `score_listening`, `score_empathy`, `score_resolution`,
  `score_policy`, `score_closing` (six `smallint` columns, each `check (...
  between 0 and 100)`), `total_score smallint not null` (also 0–100 checked),
  `ai_feedback text`, `trainer_notes text`, `scored_at timestamptz not null
  default now()`.
- Production adds `call_scores_session_unique unique (session_id)` — enforces
  exactly one score row per session. No equivalent constraint exists in the
  repo file (and could not, given its per-category-row model).

### `score_matrix_weights`
- Category columns renamed and reshaped: repo file has `opening`,
  `problem_discovery`, `rapport`, `solution_focus`, `closing` (5 categories,
  `integer`, individually checked `0–100`, plus `weights_sum_to_100` check
  summing to 100). Production has `weight_opening`, `weight_listening`,
  `weight_empathy`, `weight_resolution`, `weight_policy`, `weight_closing` (6
  categories, `numeric(5,2)` with defaults `15.00/20.00/20.00/25.00/10.00/10.00`,
  no per-column check, plus `weights_sum_100` check summing to `100.00`).
  `problem_discovery` and `rapport` and `solution_focus` do not exist in
  production; `listening`, `empathy`, `policy` are new category names with no
  equivalent in the repo file.
- Missing column: repo file's `created_at timestamptz` does not exist in
  production.
- New column not in repo file: `updated_by uuid` (FK to `staff_profiles`,
  `on delete set null`).
- Constraint semantics changed: repo file declares `global_weights_unique
  unique (cohort_id) where cohort_id IS NULL` — a **partial** unique index
  that only constrains rows where `cohort_id` is null (i.e., enforces a single
  global-default row). Production's `matrix_weights_cohort_unique` is a
  **plain** `unique (cohort_id)` with no `where` clause. Because SQL unique
  constraints treat `NULL` as distinct from every other `NULL`, a plain unique
  constraint does **not** prevent multiple rows with `cohort_id IS NULL` —
  production has weaker guarantees against duplicate global-default rows than
  the repo file specifies, despite having a same-named-sounding constraint.
- RLS: 2 policies in production ("Participants can read score matrix", "Staff
  can manage score matrix"); none in the repo file.

### `certifications`
- `issued_at timestamptz not null default now()` → renamed and retyped to
  `issued_date date not null default CURRENT_DATE` in production (timestamp
  precision is lost; production only records the calendar date).
- `revoked_at timestamptz` → replaced by `revoked_reason text` in production;
  production no longer records *when* a certification was revoked, only a
  free-text reason.
- Missing column: repo file's `updated_at timestamptz` does not exist in
  production.
- `qualifying_avg` / `qualifying_calls`: `integer` in the repo file, `smallint`
  in production.
- New trigger not in repo file: `trg_generate_cert_number` (`before insert`) —
  auto-generates `cert_number` as `'MPR-' || year || '-' ||
  lpad(nextval('cert_seq')::text, 4, '0')` when not supplied, backed by a
  `cert_seq` sequence. The repo file's comment says cert_number is e.g.
  `"CERT-0001"` with no generator defined; production's actual generated format
  is `MPR-<year>-<4 digits>`, a different prefix and shape than the repo file's
  own example.
- RLS: 2 policies in production ("Participants can read own certifications",
  "Staff can manage certifications"); none in the repo file.

---

## 2. Tables in production with no representation anywhere in the repo (7)

All seven belong to the "MORPHEUS.EDU" course/credentialing feature and do not
appear in `morpheus_schema_v1.sql` under any name:

1. `edu_courses` — course catalog (`code` unique, `is_published`, `credential_prefix`).
2. `edu_modules` — course modules (`status` check-constrained to `available|outline|locked`).
3. `edu_lessons` — lesson content in markdown (`kind` check-constrained to `lesson|lab|checkpoint`).
4. `edu_checkpoint_questions` — auto-graded quiz items per module.
5. `edu_progress` — one row per lesson a participant has completed.
6. `edu_checkpoint_attempts` — quiz attempt records with `score`, `passed`, `answers jsonb`.
7. `edu_credentials` — issued credential registry (`credential_code` unique,
   `status` check-constrained to `active|revoked|expired`), backed by the
   `edu_next_credential_code()` and `edu_verify_credential()` functions, neither
   of which appears in the repo.

All seven use `gen_random_uuid()` (pgcrypto) as their `id` default, versus
`uuid_generate_v4()` (uuid-ossp) used by all 8 tables the repo file documents —
two different UUID-generation extensions are in live use side by side, a
distinction the repo file (which only ever used `uuid_generate_v4()`) gives no
indication of.

## 3. Views in production with no representation anywhere in the repo (3)

None of these are `create view` anywhere in the repo:

1. `v_participant_performance` — per-participant rollup: completed call count,
   average total/category scores, best score, `is_certified` flag. Joins
   `participants`, `staff_profiles`, `call_sessions`, `call_scores`,
   `certifications`.
2. `v_cohort_overview` — per-cohort rollup: trainer name, enrolled participant
   count, completed call count, cohort average score. Joins `cohorts`,
   `staff_profiles`, `cohort_enrollments`, `call_sessions`, `call_scores`.
3. `v_certification_eligibility` — per-participant eligibility check:
   completed call count, average score, computed `is_eligible` (>= 5 completed
   calls AND avg >= 80), `already_certified` flag. Joins `participants`,
   `call_sessions`, `call_scores`, `certifications`.

All three depend on columns that only exist in production's shape of
`call_scores` (e.g. `score_opening`, `total_score`) and `cohort_enrollments`
(e.g. `enrollment_status`) — they could not run against the schema the repo
file defines.

Context beyond the requested scope: the `public` schema in this same Supabase
project additionally contains **27 more views** — 4 `core_*`, 14 `ec_*`, 9
`ml_*` — that expose tables belonging to two other products (`empowercare` and
`melrah` schemas) and a shared tenant/module registry (`core` schema) hosted in
the same database. These are unrelated to the Morpheus CRM data model, are not
reconstructed in `db/production_snapshot.sql`, and are not counted in "3 views"
above; they are noted here only because their existence is itself a fact about
the live database that the repo gives no hint of.

## 4. Functions and triggers in production with no representation in the repo

Repo file defines zero functions and zero triggers. Production has 8 functions
(`current_participant_id`, `current_user_role`, `edu_next_credential_code`,
`edu_verify_credential`, `generate_cert_number`, `generate_cts_id`,
`morpheus_bootstrap`, `touch_updated_at`) and 5 triggers (`trg_generate_cert_number`
on `certifications`, `trg_touch_cohorts` on `cohorts`, `trg_generate_cts_id` and
`trg_touch_participants` on `participants`, `trg_touch_staff_profiles` on
`staff_profiles`). Notably, `touch_updated_at` is wired to only 3 of the tables
that have an `updated_at` column (`staff_profiles`, `cohorts`, `participants`) —
`call_sessions`, `call_scores`, `cohort_enrollments`, `score_matrix_weights`,
and `certifications` either lack `updated_at` in production or have it but no
trigger keeps it current (see `score_matrix_weights.updated_at`, which has no
trigger despite the column existing).

## 5. Row Level Security

`morpheus_schema_v1.sql` contains zero `alter table ... enable row level
security` statements and zero `create policy` statements — every table it
defines would be created with RLS off (readable/writable by any role with
table grants, subject only to Postgres role-level GRANTs).

Production has RLS **enabled** on all 15 public tables and defines **38**
policies total across them (verified via `pg_policy` count query, matching the
policies reconstructed in `db/production_snapshot.sql` one-for-one). Every
policy is `PERMISSIVE`, targets `public` or `authenticated` roles, and gates
access through two `SECURITY DEFINER` helper functions, `current_user_role()`
(reads `auth.users.raw_user_meta_data->>'role'`) and `current_participant_id()`
(maps `auth.uid()` to a `participants.id`) — neither of which exists in the
repo file, so none of this access-control model is derivable from it.

## 6. Enums

All 7 enum types (`user_role`, `program_source`, `participant_status`,
`cohort_status`, `session_status`, `cert_status`, `enrollment_status`) match
the repo file's definitions exactly — same type names, same labels, same
order. No drift found here.
