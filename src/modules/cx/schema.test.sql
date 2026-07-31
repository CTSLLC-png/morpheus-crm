-- =============================================================
--  MORPHEUS CRM — CX Module RLS Test
--  Follows the verification-SQL precedent set by
--  morpheus_production_checklist.sql.
--
--  Asserts the super_admin-only draft → approved/published gate and
--  org_id scoping actually hold, rather than trusting that the
--  policies read correctly.
--
--  RUN AGAINST A SCRATCH DATABASE ONLY. It inserts fixture orgs,
--  users, plans, and feedback, and rolls everything back at the end
--  — but it does write to auth.users along the way.
--
--    psql -v ON_ERROR_STOP=1 -f src/modules/cx/schema.sql
--    psql -v ON_ERROR_STOP=1 -f src/modules/cx/schema.test.sql
--
--  Local (non-Supabase) postgres additionally needs an auth shim:
--    create schema auth;
--    create table auth.users (id uuid primary key, email text);
--    create role authenticated;
--    create function auth.uid() returns uuid language sql stable as
--      $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
--
--  Expected output: every line reads "PASS ...". Any FAIL raises.
-- =============================================================

begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;


-- ── Fixtures ─────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@cts.test'),
  ('22222222-2222-2222-2222-222222222222', 'trainer@cts.test'),
  ('33333333-3333-3333-3333-333333333333', 'outsider@other.test');

insert into organizations (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'CTS Albany', 'cts-albany-test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Other Org',  'other-org-test');

insert into org_members (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'super_admin'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'trainer'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'super_admin');


-- ── Assertion helper ─────────────────────────────────────────
create or replace function pg_temp.assert(label text, actual text, expected text)
returns void language plpgsql as $$
begin
  if actual is not distinct from expected then
    raise notice 'PASS  %', label;
  else
    raise exception 'FAIL  %  (got "%", want "%")', label, actual, expected;
  end if;
end;
$$;

-- Runs sql as `user_id` under the authenticated role and reports the
-- outcome as a row count, or as the denial kind when it errors.
-- Runs in its own subtransaction so a rejected statement does not
-- abort the whole test.
create or replace function pg_temp.as_user(user_id uuid, sql text)
returns text language plpgsql as $$
declare n integer;
begin
  perform set_config('request.jwt.claim.sub', user_id::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    execute sql;
    get diagnostics n = row_count;
    perform set_config('role', 'none', true);
    return n::text;
  exception
    when insufficient_privilege then
      perform set_config('role', 'none', true); return 'ERR:rls';
    when check_violation then
      perform set_config('role', 'none', true);
      return case when sqlerrm like '%immutable%' then 'ERR:immutable'
                  else 'ERR:transition' end;
  end;
end;
$$;


-- ── The gate ─────────────────────────────────────────────────
do $$
declare
  admin_id   uuid := '11111111-1111-1111-1111-111111111111';
  trainer_id uuid := '22222222-2222-2222-2222-222222222222';
  outside_id uuid := '33333333-3333-3333-3333-333333333333';
  org_id     uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  plan_id    uuid := gen_random_uuid();
  plan2_id   uuid := gen_random_uuid();
begin
  -- Generation path: any org member writes drafts, and only drafts.
  perform pg_temp.assert('trainer can insert a draft plan',
    pg_temp.as_user(trainer_id, format(
      'insert into cx_improvement_plans (id,org_id,title,status) values (%L,%L,%L,%L)',
      plan_id, org_id, 'Q3 gaps', 'draft')), '1');

  perform pg_temp.assert('trainer CANNOT insert a pre-approved plan',
    pg_temp.as_user(trainer_id, format(
      'insert into cx_improvement_plans (org_id,title,status) values (%L,%L,%L)',
      org_id, 'sneaky', 'approved')), 'ERR:rls');

  -- THE GATE: draft -> approved requires super_admin.
  perform pg_temp.assert('trainer CANNOT promote draft -> approved',
    pg_temp.as_user(trainer_id, format(
      'update cx_improvement_plans set status = %L where id = %L', 'approved', plan_id)), 'ERR:rls');

  -- Blocked too, but by the transition trigger rather than RLS: a
  -- BEFORE UPDATE trigger runs before the policy's WITH CHECK, and
  -- draft -> published is an illegal edge for everyone. The denial
  -- shape differs; the outcome is the same.
  perform pg_temp.assert('trainer CANNOT promote draft -> published',
    pg_temp.as_user(trainer_id, format(
      'update cx_improvement_plans set status = %L where id = %L', 'published', plan_id)), 'ERR:transition');

  -- ...but a trainer may still revise draft content.
  perform pg_temp.assert('trainer CAN edit draft content',
    pg_temp.as_user(trainer_id, format(
      'update cx_improvement_plans set executive_summary = %L where id = %L', 'edited', plan_id)), '1');

  perform pg_temp.assert('super_admin CAN promote draft -> approved',
    pg_temp.as_user(admin_id, format(
      'update cx_improvement_plans set status = %L where id = %L', 'approved', plan_id)), '1');

  -- Review trail is stamped server-side by the trigger.
  perform pg_temp.assert('trigger stamped reviewed_by / reviewed_at',
    (select count(*)::text from cx_improvement_plans
      where id = plan_id and reviewed_by = admin_id and reviewed_at is not null), '1');

  -- Now the plan is approved, the member policy's USING no longer
  -- matches it (status <> 'draft'), so a trainer's writes are
  -- filtered out entirely: silent 0 rows, this time from RLS.
  perform pg_temp.assert('trainer CANNOT edit an approved plan',
    pg_temp.as_user(trainer_id, format(
      'update cx_improvement_plans set title = %L where id = %L', 'hijack', plan_id)), '0');

  perform pg_temp.assert('trainer CANNOT publish an approved plan',
    pg_temp.as_user(trainer_id, format(
      'update cx_improvement_plans set status = %L where id = %L', 'published', plan_id)), '0');

  perform pg_temp.assert('super_admin CAN publish an approved plan',
    pg_temp.as_user(admin_id, format(
      'update cx_improvement_plans set status = %L where id = %L', 'published', plan_id)), '1');

  perform pg_temp.assert('published plan content is immutable',
    pg_temp.as_user(admin_id, format(
      'update cx_improvement_plans set title = %L where id = %L', 'rewritten', plan_id)), 'ERR:immutable');

  -- Illegal edge, even for a super_admin.
  perform pg_temp.as_user(trainer_id, format(
    'insert into cx_improvement_plans (id,org_id,title,status) values (%L,%L,%L,%L)',
    plan2_id, org_id, 'Q4', 'draft'));

  perform pg_temp.assert('draft -> published in one hop is rejected',
    pg_temp.as_user(admin_id, format(
      'update cx_improvement_plans set status = %L where id = %L', 'published', plan2_id)), 'ERR:transition');

  -- ── org_id scoping ─────────────────────────────────────────
  perform pg_temp.assert('foreign org sees zero plans',
    pg_temp.as_user(outside_id, 'select id from cx_improvement_plans'), '0');

  -- Denial here is a silent 0 rows, not an error: the row is not
  -- visible to the UPDATE at all, so no WITH CHECK ever runs.
  perform pg_temp.assert('foreign super_admin CANNOT promote our plan',
    pg_temp.as_user(outside_id, format(
      'update cx_improvement_plans set status = %L where id = %L', 'approved', plan2_id)), '0');

  -- org_members is the RLS role source, so it must not be self-writable.
  perform pg_temp.assert('trainer CANNOT self-promote to super_admin',
    pg_temp.as_user(trainer_id, format(
      'update org_members set role = %L where user_id = %L', 'super_admin', trainer_id)), '0');

  -- ── feedback scoping ───────────────────────────────────────
  perform pg_temp.as_user(trainer_id, format(
    'insert into cx_feedback_entries (org_id,comment) values (%L,%L)',
    org_id, 'closing module felt rushed'));

  perform pg_temp.assert('org member sees own org feedback',
    pg_temp.as_user(trainer_id, 'select id from cx_feedback_entries'), '1');

  perform pg_temp.assert('foreign org sees zero feedback',
    pg_temp.as_user(outside_id, 'select id from cx_feedback_entries'), '0');

  perform pg_temp.assert('cannot insert feedback into a foreign org',
    pg_temp.as_user(outside_id, format(
      'insert into cx_feedback_entries (org_id,comment) values (%L,%L)', org_id, 'injected')), 'ERR:rls');

  raise notice '';
  raise notice 'All CX RLS assertions passed.';
end $$;

rollback;
