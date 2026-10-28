-- Creator Studio render engine (cs_*) — script → estimate → approval → render.
--
-- Adapted from the creator-studio package for this database's real tenancy:
--   * org_id is core.tenant.id (uuid), not a text slug
--   * membership is core.membership via core.member_of() / core.has_role()
--   * the tenant must have the growth.studio module enabled (Fiserv-style
--     licensing: a module that is switched off for a tenant serves nothing)
--
-- Review fixes applied on top of the package's 001_creator_studio.sql:
--   1. One approval and one job per estimate (double-click could double-spend)
--   2. Approvals only for the project's latest estimate while it awaits approval
--   3. Members can't move a project between tenants, flip commercial_release
--      or provider routing (that unlocks non-commercial models / paid vendors),
--      or edit a project/scenes while it is approved or rendering
--   4. Re-runnable: every policy is dropped first; publication add is guarded
--   5. Storage bucket has a size cap and a MIME allow-list
--
-- The render worker uses the service role and bypasses RLS. The browser only
-- reads rows, writes projects/scenes, and records approvals.

create extension if not exists pgcrypto;

-- ── Access helpers ──────────────────────────────────────────────────────────
create or replace function public.cs_module_on(p_org uuid)
returns boolean language sql stable security definer set search_path = core, public as $$
  select exists (select 1 from core.tenant_module tm
                 where tm.tenant_id = p_org and tm.module_key = 'growth.studio' and tm.enabled);
$$;

create or replace function public.cs_is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = core, public as $$
  select core.member_of(p_org) and public.cs_module_on(p_org);
$$;

-- Approvers spend money: tenant OWNER or ADMIN only.
create or replace function public.cs_is_approver(p_org uuid)
returns boolean language sql stable security definer set search_path = core, public as $$
  select core.has_role(p_org, array['OWNER','ADMIN']) and public.cs_module_on(p_org);
$$;

revoke all on function public.cs_module_on(uuid), public.cs_is_member(uuid), public.cs_is_approver(uuid) from public, anon;
grant execute on function public.cs_module_on(uuid), public.cs_is_member(uuid), public.cs_is_approver(uuid) to authenticated, service_role;

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.cs_projects (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references core.tenant(id) on delete restrict,
  studio_project_id  uuid references public.studio_project(id) on delete set null,
  title              text not null check (char_length(title) between 1 and 200),
  series             text check (char_length(series) <= 200),
  episode            int  check (episode is null or episode between 0 and 10000),
  brief              text check (char_length(brief) <= 30000),
  script             text check (char_length(script) <= 200000),
  aspect_ratios      text[] not null default '{16:9}'
                       check (aspect_ratios <@ array['16:9','9:16','1:1'] and cardinality(aspect_ratios) between 1 and 3),
  style              jsonb not null default '{}'::jsonb,
  provider_overrides jsonb not null default '{}'::jsonb,
  commercial_release boolean not null default true,
  status             text not null default 'draft' check (status in (
                       'draft','estimating','awaiting_approval','approved','running',
                       'rendered','published','rejected','failed')),
  created_by         uuid references auth.users(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.cs_projects is
  'Creator Studio render engine: one production to price and render. Tenant-scoped (core.tenant) and gated on the growth.studio module. Optional link to a studio_project.';

create table if not exists public.cs_scenes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references core.tenant(id) on delete restrict,
  project_id     uuid not null references public.cs_projects(id) on delete cascade,
  idx            int not null check (idx >= 0),
  duration_s     numeric(6,2) not null default 5 check (duration_s > 0 and duration_s <= 600),
  narration      text check (char_length(narration) <= 5000),
  speaker        text default 'narrator' check (char_length(speaker) <= 60),
  visual_prompt  text check (char_length(visual_prompt) <= 2000),
  visual_mode    text not null default 'kenburns' check (visual_mode in ('still','kenburns','motion','stock','title')),
  camera         text not null default 'push_in' check (camera in ('push_in','pull_out','pan_left','pan_right','static')),
  on_screen_text text check (char_length(on_screen_text) <= 300),
  lower_third    text check (char_length(lower_third) <= 200),
  music_cue      text check (char_length(music_cue) <= 300),
  transition_in  text not null default 'crossfade' check (transition_in in ('cut','crossfade','dip_to_black','wipe')),
  unique (project_id, idx)
);

create table if not exists public.cs_cost_estimates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references core.tenant(id) on delete restrict,
  project_id    uuid not null references public.cs_projects(id) on delete cascade,
  plan_hash     text not null,
  lines         jsonb not null,
  total_usd     numeric(10,2) not null check (total_usd >= 0),
  uses_fallback boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.cs_approvals (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references core.tenant(id) on delete restrict,
  estimate_id uuid not null references public.cs_cost_estimates(id) on delete cascade,
  decision    text not null check (decision in ('approved','rejected')),
  decided_by  uuid not null default auth.uid() references auth.users(id),
  note        text check (char_length(note) <= 1000),
  decided_at  timestamptz not null default now()
);
-- Fix 1: one decision per estimate. A second click fails instead of enqueueing a second paid render.
create unique index if not exists cs_approvals_one_per_estimate on public.cs_approvals (estimate_id);

create table if not exists public.cs_jobs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references core.tenant(id) on delete restrict,
  project_id  uuid not null references public.cs_projects(id) on delete cascade,
  estimate_id uuid references public.cs_cost_estimates(id),
  stage       text,
  status      text not null default 'queued' check (status in ('queued','running','done','failed','needs_reapproval')),
  progress    numeric(5,2) default 0 check (progress between 0 and 100),
  spent_usd   numeric(10,2) not null default 0,
  error       text,
  locked_by   text,
  locked_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists cs_jobs_one_per_estimate on public.cs_jobs (estimate_id) where estimate_id is not null;

create table if not exists public.cs_assets (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references core.tenant(id) on delete restrict,
  project_id   uuid not null references public.cs_projects(id) on delete cascade,
  scene_id     uuid references public.cs_scenes(id) on delete set null,
  kind         text not null check (kind in ('voice','image','video','music','sfx','captions','render','thumbnail','logo')),
  storage_path text not null,
  duration_s   numeric(8,2),
  width        int,
  height       int,
  provenance   jsonb not null,
  created_at   timestamptz not null default now()
);

-- Likeness / voice releases for real people (LICENSE_REGISTER rule 4)
create table if not exists public.cs_releases (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references core.tenant(id) on delete restrict,
  person_name   text not null check (char_length(person_name) between 1 and 200),
  scope         text not null check (scope in ('voice','likeness','both')),
  document_path text not null,
  signed_at     date not null,
  created_at    timestamptz not null default now()
);

create index if not exists cs_projects_org_idx   on public.cs_projects (org_id, updated_at desc);
create index if not exists cs_scenes_project_idx on public.cs_scenes (project_id, idx);
create index if not exists cs_estimates_proj_idx on public.cs_cost_estimates (project_id, created_at desc);
create index if not exists cs_jobs_queue_idx     on public.cs_jobs (status, created_at) where status = 'queued';
create index if not exists cs_jobs_project_idx   on public.cs_jobs (project_id, created_at desc);
create index if not exists cs_assets_project_idx on public.cs_assets (project_id, kind);

-- Child rows must sit in the same tenant as their project.
create or replace function public.cs_same_org() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.cs_projects p where p.id = new.project_id and p.org_id = new.org_id) then
    raise exception 'org_id does not match the project''s tenant';
  end if;
  return new;
end $$;
drop trigger if exists cs_scenes_same_org on public.cs_scenes;
create trigger cs_scenes_same_org before insert or update on public.cs_scenes for each row execute function public.cs_same_org();
drop trigger if exists cs_estimates_same_org on public.cs_cost_estimates;
create trigger cs_estimates_same_org before insert or update on public.cs_cost_estimates for each row execute function public.cs_same_org();
drop trigger if exists cs_jobs_same_org on public.cs_jobs;
create trigger cs_jobs_same_org before insert or update on public.cs_jobs for each row execute function public.cs_same_org();
drop trigger if exists cs_assets_same_org on public.cs_assets;
create trigger cs_assets_same_org before insert or update on public.cs_assets for each row execute function public.cs_same_org();

-- Fix 3: tenant, licensing and routing fields are fixed after creation for browser users.
create or replace function public.cs_guard_project_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' then
    if new.org_id is distinct from old.org_id then
      raise exception 'A production cannot move to another tenant';
    end if;
    if (new.commercial_release is distinct from old.commercial_release
        or new.provider_overrides is distinct from old.provider_overrides)
       and not public.cs_is_approver(old.org_id) then
      raise exception 'Only an approver can change licensing or provider routing';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists cs_projects_guard on public.cs_projects;
create trigger cs_projects_guard before update on public.cs_projects for each row execute function public.cs_guard_project_update();

-- ── RLS ─────────────────────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['cs_projects','cs_scenes','cs_cost_estimates','cs_approvals','cs_jobs','cs_assets','cs_releases'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.cs_is_member(org_id))', t || '_member_read', t);
  end loop;
end $$;

grant select on public.cs_projects, public.cs_scenes, public.cs_cost_estimates, public.cs_approvals,
                public.cs_jobs, public.cs_assets, public.cs_releases to authenticated;
grant insert, update on public.cs_projects to authenticated;
grant insert, update, delete on public.cs_scenes to authenticated;
grant insert on public.cs_approvals, public.cs_releases to authenticated;

-- Projects: members create in their tenant; edits only while not approved/rendering.
drop policy if exists cs_projects_member_insert on public.cs_projects;
create policy cs_projects_member_insert on public.cs_projects for insert to authenticated
  with check (public.cs_is_member(org_id) and status in ('draft','estimating'));
drop policy if exists cs_projects_member_update on public.cs_projects;
create policy cs_projects_member_update on public.cs_projects for update to authenticated
  using (public.cs_is_member(org_id) and status in ('draft','estimating','awaiting_approval','rejected','failed','rendered'))
  with check (public.cs_is_member(org_id) and status in ('draft','estimating','awaiting_approval'));

-- Scenes: editable only while the project is editable.
drop policy if exists cs_scenes_member_write on public.cs_scenes;
create policy cs_scenes_member_write on public.cs_scenes for all to authenticated
  using (public.cs_is_member(org_id) and exists (
    select 1 from public.cs_projects p where p.id = project_id
      and p.status in ('draft','estimating','awaiting_approval','rejected','failed','rendered')))
  with check (public.cs_is_member(org_id) and exists (
    select 1 from public.cs_projects p where p.id = project_id and p.org_id = cs_scenes.org_id
      and p.status in ('draft','estimating','awaiting_approval')));

drop policy if exists cs_releases_member_write on public.cs_releases;
create policy cs_releases_member_write on public.cs_releases for insert to authenticated
  with check (public.cs_is_member(org_id));

-- Fix 2: approve only the project's latest estimate, only while it awaits approval.
drop policy if exists cs_approvals_approver_write on public.cs_approvals;
create policy cs_approvals_approver_write on public.cs_approvals for insert to authenticated with check (
  public.cs_is_approver(org_id)
  and decided_by = auth.uid()
  and exists (
    select 1 from public.cs_cost_estimates e
    join public.cs_projects p on p.id = e.project_id
    where e.id = estimate_id
      and e.org_id = cs_approvals.org_id
      and p.status = 'awaiting_approval'
      and e.id = (select e2.id from public.cs_cost_estimates e2
                  where e2.project_id = e.project_id order by e2.created_at desc, e2.id desc limit 1))
);

-- Approval → project approved + exactly one queued job.
create or replace function public.cs_on_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.decision = 'approved' then
    update public.cs_projects p set status = 'approved', updated_at = now()
      from public.cs_cost_estimates e where e.id = new.estimate_id and p.id = e.project_id;
    insert into public.cs_jobs (org_id, project_id, estimate_id, status)
      select e.org_id, e.project_id, e.id, 'queued' from public.cs_cost_estimates e where e.id = new.estimate_id
      on conflict do nothing;
  else
    update public.cs_projects p set status = 'rejected', updated_at = now()
      from public.cs_cost_estimates e where e.id = new.estimate_id and p.id = e.project_id;
  end if;
  return new;
end $$;
revoke all on function public.cs_on_approval() from public, anon, authenticated;
drop trigger if exists cs_approval_trg on public.cs_approvals;
create trigger cs_approval_trg after insert on public.cs_approvals for each row execute function public.cs_on_approval();

-- Worker claims a job atomically (service role only).
create or replace function public.cs_claim_job(p_worker text) returns public.cs_jobs
language plpgsql security definer set search_path = public as $$
declare j public.cs_jobs;
begin
  select * into j from public.cs_jobs where status = 'queued' order by created_at
    for update skip locked limit 1;
  if not found then return null; end if;
  update public.cs_jobs set status = 'running', locked_by = p_worker, locked_at = now(), updated_at = now()
    where id = j.id returning * into j;
  return j;
end $$;
revoke all on function public.cs_claim_job(text) from public, anon, authenticated;
grant execute on function public.cs_claim_job(text) to service_role;

-- ── Private storage: creator-studio/{org_id}/{project_id}/{kind}/file ───────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creator-studio', 'creator-studio', false, 2147483648, array[
  'video/mp4','audio/wav','audio/x-wav','audio/mpeg','image/png','image/jpeg',
  'application/json','text/plain','application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cs_storage_member_read on storage.objects;
create policy cs_storage_member_read on storage.objects for select to authenticated
  using (bucket_id = 'creator-studio'
         and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then public.cs_is_member(((storage.foldername(name))[1])::uuid)
                  else false end);

-- ── Realtime for render progress ────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cs_jobs') then
    alter publication supabase_realtime add table public.cs_jobs;
  end if;
end $$;

-- ── Module description ──────────────────────────────────────────────────────
update core.module
   set description = 'Production workspace: projects, asset vault, production queue and the in-house render engine (script → estimate → approval → video)'
 where key = 'growth.studio';
