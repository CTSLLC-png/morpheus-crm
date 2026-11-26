-- Creator Studio — render queue.
-- Staff ask for a render from inside Creator Studio instead of pushing a git
-- branch. The cloud render worker (.github/workflows/studio-render.yml) picks
-- up queued jobs through the studio-agent edge function, renders the named
-- script with the in-house renderer, files the results in the asset vault and
-- reports back here, so the job's status shows in the module.
--
-- Who can do what:
--   staff (trainer, super_admin)  read jobs, queue a job, cancel a queued job
--   super_admin                   also delete old jobs
--   service_role (studio-agent)   claim the next job and finish it, via two
--                                 functions nobody else can execute
-- Staff can only write script, project_id and note on insert, and only the
-- status (queued → cancelled) on update, so they cannot fake a finished job.
-- Requires sql/0016_creator_studio.sql.

create table if not exists public.studio_render_job (
  id            uuid primary key default gen_random_uuid(),
  -- File name, without .json, of a script in tools/video/scripts.
  script        text not null check (script ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  project_id    uuid references public.studio_project(id) on delete set null,
  status        text not null default 'queued' check (status in ('queued','running','done','failed','cancelled')),
  note          text check (char_length(note) <= 500),
  requested_by  uuid references auth.users(id) default auth.uid(),
  requested_at  timestamptz not null default now(),
  claimed_at    timestamptz,
  finished_at   timestamptz,
  attempts      smallint not null default 0,
  run_url       text check (run_url is null or (run_url ~ '^https://github\.com/\S+$' and char_length(run_url) <= 300)),
  asset_count   smallint check (asset_count between 0 and 100),
  error         text check (char_length(error) <= 2000)
);
comment on table public.studio_render_job is
  'Creator Studio render queue. Staff queue a script; the cloud render worker claims it through studio-agent, files the output in the asset vault and marks it done or failed.';

-- One open job per script and project, so pressing Render twice is harmless.
create unique index if not exists studio_render_job_open_uq
  on public.studio_render_job (script, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('queued', 'running');
create index if not exists studio_render_job_status_idx on public.studio_render_job (status, requested_at);

-- ── Flood guard: at most 20 jobs waiting or running at once ─────────────────
create or replace function public.studio_render_job_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (select count(*) from public.studio_render_job where status in ('queued','running')) >= 20 then
    raise exception 'The render queue is full (20 open jobs). Wait for some to finish or cancel one.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.studio_render_job_guard() from public, anon, authenticated;

drop trigger if exists studio_render_job_guard on public.studio_render_job;
create trigger studio_render_job_guard before insert on public.studio_render_job
  for each row execute function public.studio_render_job_guard();

-- Cancelling stamps finished_at, so the history reads correctly.
create or replace function public.studio_render_job_touch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status in ('done','failed','cancelled') and old.status not in ('done','failed','cancelled') then
    new.finished_at := coalesce(new.finished_at, now());
  end if;
  return new;
end $$;
revoke execute on function public.studio_render_job_touch() from public, anon, authenticated;

drop trigger if exists studio_render_job_touch on public.studio_render_job;
create trigger studio_render_job_touch before update on public.studio_render_job
  for each row execute function public.studio_render_job_touch();

-- ── RLS and column grants ───────────────────────────────────────────────────
alter table public.studio_render_job enable row level security;

drop policy if exists studio_render_job_staff_read on public.studio_render_job;
create policy studio_render_job_staff_read on public.studio_render_job for select to authenticated
  using (public.current_user_role() in ('trainer','super_admin'));

drop policy if exists studio_render_job_staff_insert on public.studio_render_job;
create policy studio_render_job_staff_insert on public.studio_render_job for insert to authenticated
  with check (public.current_user_role() in ('trainer','super_admin') and status = 'queued');

drop policy if exists studio_render_job_staff_cancel on public.studio_render_job;
create policy studio_render_job_staff_cancel on public.studio_render_job for update to authenticated
  using (public.current_user_role() in ('trainer','super_admin') and status = 'queued')
  with check (status = 'cancelled');

drop policy if exists studio_render_job_admin_delete on public.studio_render_job;
create policy studio_render_job_admin_delete on public.studio_render_job for delete to authenticated
  using (public.current_user_role() = 'super_admin' and status in ('done','failed','cancelled'));

revoke all on public.studio_render_job from anon, authenticated;
grant select, delete on public.studio_render_job to authenticated;
grant insert (script, project_id, note) on public.studio_render_job to authenticated;
grant update (status) on public.studio_render_job to authenticated;

-- ── Worker functions (service_role only, called by studio-agent) ────────────

-- Claims the oldest queued job. A job left running for over two hours (a
-- worker that died) is failed first so it never blocks the queue.
create or replace function public.studio_claim_render_job(p_run_url text default null)
returns setof public.studio_render_job
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_run_url is not null and (p_run_url !~ '^https://github\.com/\S+$' or char_length(p_run_url) > 300) then
    raise exception 'run_url must be a https://github.com/ link' using errcode = 'invalid_parameter_value';
  end if;

  update public.studio_render_job
     set status = 'failed', error = 'Timed out: the render worker stopped reporting.'
   where status = 'running' and claimed_at < now() - interval '2 hours';

  return query
  update public.studio_render_job j
     set status = 'running', claimed_at = now(), attempts = j.attempts + 1,
         run_url = p_run_url, error = null
   where j.id = (select q.id from public.studio_render_job q
                  where q.status = 'queued'
                  order by q.requested_at
                  for update skip locked
                  limit 1)
  returning j.*;
end $$;

-- Marks a running job done or failed. Only a running job can be finished.
create or replace function public.studio_finish_render_job(
  p_id uuid, p_ok boolean, p_asset_count integer default null, p_error text default null)
returns public.studio_render_job
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.studio_render_job;
begin
  if p_asset_count is not null and (p_asset_count < 0 or p_asset_count > 100) then
    raise exception 'asset_count must be 0 to 100' using errcode = 'invalid_parameter_value';
  end if;
  update public.studio_render_job
     set status = case when p_ok then 'done' else 'failed' end,
         finished_at = now(),
         asset_count = p_asset_count,
         error = case when p_ok then null else left(coalesce(nullif(trim(p_error), ''), 'Render failed.'), 2000) end
   where id = p_id and status = 'running'
  returning * into r;
  if r.id is null then
    raise exception 'job % is not running', p_id using errcode = 'no_data_found';
  end if;
  return r;
end $$;

revoke execute on function public.studio_claim_render_job(text) from public, anon, authenticated;
revoke execute on function public.studio_finish_render_job(uuid, boolean, integer, text) from public, anon, authenticated;
grant execute on function public.studio_claim_render_job(text) to service_role;
grant execute on function public.studio_finish_render_job(uuid, boolean, integer, text) to service_role;
grant select, insert, update on public.studio_render_job to service_role;

-- ── Module registration: same module, wider description ─────────────────────
update core.module
   set description = 'Production workspace: projects, asset vault, production queue and cloud render queue, fed by Campaign Studio'
 where key = 'growth.studio';
