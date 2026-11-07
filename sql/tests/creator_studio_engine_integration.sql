-- Security + lifecycle checks for sql/0020_creator_studio_engine.sql.
-- Run after the bootstrap and the migration. Every check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
-- Supabase grants the service role full table access by default; mirror that here.
grant all on all tables in schema public, storage to service_role;

-- ── Fixture: two tenants, an owner and a member in A, an owner in B, a tenant C with the module off
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d');
insert into core.tenant (id, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'ta'), ('bbbbbbbb-0000-0000-0000-000000000000', 'tb'),
  ('cccccccc-0000-0000-0000-000000000000', 'tc');
insert into core.membership values
  ('00000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'OWNER'),
  ('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000000', 'MEMBER'),
  ('00000000-0000-0000-0000-00000000000c', 'bbbbbbbb-0000-0000-0000-000000000000', 'OWNER'),
  ('00000000-0000-0000-0000-00000000000d', 'cccccccc-0000-0000-0000-000000000000', 'OWNER');
insert into core.tenant_module values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'growth.studio', true),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'growth.studio', true),
  ('cccccccc-0000-0000-0000-000000000000', 'growth.studio', false);

-- helper to run as a user
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('test.uid', u, false); end $$;

-- 1. Member of A creates a project; B can't see it; C (module off) can't create one
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.cs_projects (id, org_id, title, script, status)
  values ('11111111-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Ep 1', 'NARRATOR: hi.', 'estimating');
do $$ begin
  if (select count(*) from public.cs_projects) <> 1 then raise exception 'member should see own project'; end if;
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if (select count(*) from public.cs_projects) <> 0 then raise exception 'FAIL: tenant B can read tenant A'; end if;
  begin
    insert into public.cs_projects (org_id, title) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x');
    raise exception 'FAIL: tenant B wrote into tenant A';
  exception when insufficient_privilege then null; end;
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ begin
  begin
    insert into public.cs_projects (org_id, title) values ('cccccccc-0000-0000-0000-000000000000', 'x');
    raise exception 'FAIL: tenant with module disabled created a project';
  exception when insufficient_privilege then null; end;
end $$;

-- 2. Member can't move project to another tenant or flip licensing
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin
    update public.cs_projects set commercial_release = false where id = '11111111-0000-0000-0000-000000000000';
    raise exception 'FAIL: member flipped commercial_release';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    update public.cs_projects set status = 'approved' where id = '11111111-0000-0000-0000-000000000000';
    raise exception 'FAIL: member self-approved via status';
  exception when insufficient_privilege then null; end;
end $$;

-- 3. Worker (service role) writes scenes and two estimates; project awaits approval
reset role;
set role service_role;
insert into public.cs_scenes (org_id, project_id, idx, narration)
  values ('aaaaaaaa-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000', 0, 'hi');
insert into public.cs_cost_estimates (id, org_id, project_id, plan_hash, lines, total_usd, created_at) values
  ('e0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000', 'old', '[]', 1, now() - interval '1 hour'),
  ('e0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000', 'new', '[]', 2, now());
update public.cs_projects set status = 'awaiting_approval' where id = '11111111-0000-0000-0000-000000000000';
do $$ begin
  begin
    insert into public.cs_jobs (org_id, project_id) values ('bbbbbbbb-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000');
    raise exception 'FAIL: job row accepted with a mismatched tenant';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;

-- 4. Plain member cannot approve; owner of B cannot approve A's estimate; owner of A cannot approve a stale estimate
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin
    insert into public.cs_approvals (org_id, estimate_id, decision) values ('aaaaaaaa-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000002', 'approved');
    raise exception 'FAIL: plain member approved spend';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  begin
    insert into public.cs_approvals (org_id, estimate_id, decision) values ('bbbbbbbb-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000002', 'approved');
    raise exception 'FAIL: cross-tenant approval accepted';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin
    insert into public.cs_approvals (org_id, estimate_id, decision) values ('aaaaaaaa-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000001', 'approved');
    raise exception 'FAIL: stale estimate approved';
  exception when insufficient_privilege then null; end;
end $$;

-- 5. Owner approves the latest estimate → exactly one job; a second click is refused
insert into public.cs_approvals (org_id, estimate_id, decision) values ('aaaaaaaa-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000002', 'approved');
do $$ begin
  begin
    insert into public.cs_approvals (org_id, estimate_id, decision) values ('aaaaaaaa-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000002', 'approved');
    raise exception 'FAIL: second approval accepted (double spend)';
  exception when insufficient_privilege or unique_violation then null; end;
  if (select count(*) from public.cs_jobs) <> 1 then raise exception 'FAIL: expected exactly one job'; end if;
  if (select status from public.cs_projects) <> 'approved' then raise exception 'FAIL: project not approved'; end if;
end $$;

-- 5b. Even if two approvals race past the policy (concurrent clicks), the
--     unique indexes allow one approval and one job. Simulated by bypassing RLS.
reset role;
set role service_role;
do $$ begin
  begin
    insert into public.cs_approvals (org_id, estimate_id, decision, decided_by)
      values ('aaaaaaaa-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000002', 'approved', '00000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL: duplicate approval row stored';
  exception when unique_violation then null; end;
  insert into public.cs_jobs (org_id, project_id, estimate_id)
    values ('aaaaaaaa-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000002')
    on conflict do nothing;
  if (select count(*) from public.cs_jobs) <> 1 then raise exception 'FAIL: duplicate job for one estimate'; end if;
end $$;
reset role;
set role authenticated;

-- 6. While approved/running, members can't edit the project or its scenes
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ declare n int; begin
  update public.cs_projects set script = 'changed' where id = '11111111-0000-0000-0000-000000000000';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: approved project was editable'; end if;
  update public.cs_scenes set narration = 'changed';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: scenes editable after approval'; end if;
  begin
    perform public.cs_claim_job('x');
    raise exception 'FAIL: browser user could claim a job';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 7. Worker claims the job atomically, once
set role service_role;
do $$ declare j public.cs_jobs; begin
  j := public.cs_claim_job('w1');
  if j.id is null or j.status <> 'running' then raise exception 'FAIL: worker could not claim job'; end if;
  j := public.cs_claim_job('w2');
  if j.id is not null then raise exception 'FAIL: job claimed twice'; end if;
end $$;
reset role;

-- 8. Storage: tenant A member reads A's files only; malformed paths don't error
insert into storage.objects (bucket_id, name) values
  ('creator-studio', 'aaaaaaaa-0000-0000-0000-000000000000/11111111-0000-0000-0000-000000000000/render/a.mp4'),
  ('creator-studio', 'bbbbbbbb-0000-0000-0000-000000000000/x/render/b.mp4'),
  ('creator-studio', 'not-a-uuid/render/c.mp4');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if (select count(*) from storage.objects) <> 1 then raise exception 'FAIL: storage isolation'; end if;
end $$;
reset role;

-- 9. Anonymous users see nothing
set role anon;
do $$ begin
  begin
    perform 1 from public.cs_projects;
    raise exception 'FAIL: anon can read cs_projects';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'creator studio engine: all checks passed' as result;
