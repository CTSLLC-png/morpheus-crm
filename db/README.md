<title>README.md</title>

# db/

This directory documents the **actual, live** Supabase schema for the
MorpheusOS / Morpheus CRM project, as reconciled against the stale
`../morpheus_schema_v1.sql` in the repo root.

## Files

- **`production_snapshot.sql`** — a faithful reconstruction of the live
  `public` schema (Supabase project `ymavrmekxiwdphdyteau`): all 15 tables
  with exact columns/types/defaults/nullability, primary/foreign/unique/check
  constraints, indexes, the 3 views the application queries
  (`v_participant_performance`, `v_cohort_overview`,
  `v_certification_eligibility`), all functions and triggers, and every RLS
  policy (38, across all 15 tables). It was generated **read-only**, entirely
  from `pg_catalog` / `information_schema` queries (`pg_get_constraintdef`,
  `pg_get_viewdef`, `pg_get_functiondef`, `pg_get_triggerdef`, `pg_policies`,
  `pg_indexes`) — nothing was written to the database to produce it.

- **`DRIFT.md`** — a factual, column-by-column comparison of
  `morpheus_schema_v1.sql` against `production_snapshot.sql`: what differs on
  each of the 8 tables the old file describes, the 7 `edu_*` tables and 3
  views that exist in production but nowhere in the repo, and the RLS gap
  (0 policies in the repo file vs. 38 in production).

## Source of truth

**Production is the source of truth**, not the repo. `production_snapshot.sql`
is a snapshot taken 2026-08-27 — it will drift again the moment someone
changes the live schema without updating this file. Regenerate it from the
live database (the same catalog-query approach used to build it) rather than
hand-editing it after future schema changes, and re-diff against it before
trusting any SQL file in this repo to describe what is actually running.

## `morpheus_schema_v1.sql` — retained for history only

The original `morpheus_schema_v1.sql` at the repo root is kept as-is and was
**not** modified as part of this reconciliation. It does not describe the live
database (see `DRIFT.md` for specifics) and **should not be run** against the
production project or any environment expected to match it — it opens with
`drop table ... cascade` statements against tables that no longer match its
own definitions, and applying it would destroy production data and leave the
schema in a shape the application does not expect.
