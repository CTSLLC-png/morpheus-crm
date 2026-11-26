-- Creator Studio render queue: staff can queue and cancel but never fake a
-- finished job; participants and the public see nothing; only service_role can
-- claim and finish jobs; duplicate and flood guards hold; re-running the
-- migration is safe. Run after the bootstrap, 0016 and 0022.
\set ON_ERROR_STOP on

-- Re-run safety.
\i sql/0016_creator_studio.sql
\i sql/0022_creator_studio_render_queue.sql

reset role;
insert into public.studio_project (id, title) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Render test project')
on conflict do nothing;
grant select on public.studio_project to service_role;

-- ── Public visitor ──────────────────────────────────────────────────────────
set role anon;
do $$ begin
  perform 1 from public.studio_render_job limit 1;
  raise exception 'anon could read studio_render_job';
exception when insufficient_privilege then null;
end $$;
reset role;

-- ── Participant (signed in, not staff) ──────────────────────────────────────
set role authenticated;
select set_config('test.role', 'participant', false), set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
do $$
declare n int;
begin
  select count(*) into n from public.studio_render_job; assert n = 0, 'participant should see no jobs';
  begin
    insert into public.studio_render_job (script) values ('legacy-path-explainer');
    raise exception 'participant could queue a render';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ── Staff ───────────────────────────────────────────────────────────────────
set role authenticated;
select set_config('test.role', 'trainer', false), set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
do $$
declare j public.studio_render_job;
begin
  insert into public.studio_render_job (script, project_id, note)
  values ('legacy-path-explainer', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'first cut')
  returning * into j;
  assert j.status = 'queued', 'new job should be queued';
  assert j.requested_by = '11111111-1111-1111-1111-111111111111', 'requested_by should be the signed-in user';

  -- Same script and project while one is open: refused.
  begin
    insert into public.studio_render_job (script, project_id) values ('legacy-path-explainer', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    raise exception 'duplicate open job was accepted';
  exception when unique_violation then null;
  end;

  -- Bad script names never get in (path tricks, upper case, extension).
  begin
    insert into public.studio_render_job (script) values ('../secrets');
    raise exception 'path-like script name was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.studio_render_job (script) values ('Explainer.json');
    raise exception 'script name with extension was accepted';
  exception when check_violation then null;
  end;

  -- Staff cannot write worker fields.
  begin
    insert into public.studio_render_job (script, status) values ('other-script', 'done');
    raise exception 'staff could set status on insert';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.studio_render_job set asset_count = 5 where id = j.id;
    raise exception 'staff could set asset_count';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.studio_render_job set status = 'done' where id = j.id;
    raise exception 'staff could mark a job done';
  exception when insufficient_privilege or check_violation then null;
  end;

  -- Staff cannot call the worker functions.
  begin
    perform public.studio_claim_render_job(null);
    raise exception 'staff could claim a job';
  exception when insufficient_privilege then null;
  end;

  -- Trainers cannot delete history.
  delete from public.studio_render_job where id = j.id;
  assert (select count(*) from public.studio_render_job where id = j.id) = 1, 'trainer deleted a job';
end $$;

-- A queued job can be cancelled, and cancelling stamps finished_at.
do $$
declare j public.studio_render_job;
begin
  insert into public.studio_render_job (script) values ('cancel-me') returning * into j;
  update public.studio_render_job set status = 'cancelled' where id = j.id;
  select * into j from public.studio_render_job where id = j.id;
  assert j.status = 'cancelled' and j.finished_at is not null, 'cancel did not stick';
  -- A cancelled job cannot be revived.
  update public.studio_render_job set status = 'queued' where id = j.id;
  select * into j from public.studio_render_job where id = j.id;
  assert j.status = 'cancelled', 'cancelled job was revived';
end $$;
reset role;

-- ── Worker (service_role) ───────────────────────────────────────────────────
set role service_role;
do $$
declare j public.studio_render_job; n int;
begin
  begin
    perform public.studio_claim_render_job('https://evil.example/run');
    raise exception 'non-GitHub run_url was accepted';
  exception when invalid_parameter_value then null;
  end;

  select * into j from public.studio_claim_render_job('https://github.com/CTSLLC-png/morpheus-crm/actions/runs/1');
  assert j.script = 'legacy-path-explainer' and j.status = 'running' and j.attempts = 1, 'claim returned the wrong job';

  -- Nothing else is queued, so a second claim returns no row.
  select count(*) into n from public.studio_claim_render_job(null);
  assert n = 0, 'second claim should find nothing';

  select * into j from public.studio_finish_render_job(j.id, true, 5, null);
  assert j.status = 'done' and j.asset_count = 5 and j.finished_at is not null, 'finish did not record';

  -- A finished job cannot be finished again.
  begin
    perform public.studio_finish_render_job(j.id, false, null, 'late');
    raise exception 'finished job was finished twice';
  exception when no_data_found then null;
  end;
end $$;
reset role;

-- Stale running job is failed on the next claim.
update public.studio_render_job set status = 'running', claimed_at = now() - interval '3 hours'
 where script = 'legacy-path-explainer';
set role service_role;
do $$
declare n int;
begin
  perform public.studio_claim_render_job(null);
  select count(*) into n from public.studio_render_job where status = 'failed' and error like 'Timed out%';
  assert n = 1, 'stale running job was not failed';
end $$;
reset role;

-- ── Flood guard ─────────────────────────────────────────────────────────────
set role authenticated;
select set_config('test.role', 'trainer', false);
do $$
declare i int;
begin
  for i in 1..21 loop
    insert into public.studio_render_job (script) values ('flood-' || i);
  end loop;
  raise exception 'queue accepted more than 20 open jobs';
exception when check_violation then null;
end $$;

-- ── super_admin can clear finished history only ─────────────────────────────
select set_config('test.role', 'super_admin', false);
do $$
declare before_n int; after_n int;
begin
  select count(*) into before_n from public.studio_render_job where status in ('queued','running');
  delete from public.studio_render_job;
  select count(*) into after_n from public.studio_render_job where status in ('queued','running');
  assert before_n = after_n, 'super_admin deleted an open job';
  assert (select count(*) from public.studio_render_job where status in ('done','failed','cancelled')) = 0,
    'finished jobs were not cleared';
end $$;
reset role;

\echo 'PASS: Creator Studio render queue'
