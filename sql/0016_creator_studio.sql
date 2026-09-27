-- Creator Studio — Morpheus-native production workspace (projects, asset vault,
-- production queue). Replaces the stand-alone creator-studio-cinema site so a
-- Campaign Studio asset can become a production project without copy/paste.
-- Staff only (trainer, super_admin); deletes are super_admin only.

-- ── Projects ────────────────────────────────────────────────────────────────
create table if not exists public.studio_project (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null check (char_length(title) between 1 and 200),
  kind               text not null default 'other' check (kind in (
                       'film','animated-series','explainer','short-form','ad','social-image','print','audio','other')),
  logline            text check (char_length(logline) <= 2000),
  stage              text not null default 'pre-production' check (stage in (
                       'idea','pre-production','production','post-production','final-cut','delivered','on-hold')),
  brief              text check (char_length(brief) <= 30000),
  air_date           date,
  final_media_url    text check (final_media_url is null or (final_media_url ~ '^https://\S+$' and char_length(final_media_url) <= 2000)),
  campaign_asset_id  uuid references public.growth_campaign_asset(id) on delete set null,
  created_by         uuid references auth.users(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.studio_project is
  'Creator Studio production projects. campaign_asset_id links a project made from an approved Campaign Studio asset, so the finished media can be tied back to campaign results.';
create unique index if not exists studio_project_campaign_asset_uq
  on public.studio_project (campaign_asset_id) where campaign_asset_id is not null;

-- ── Asset vault ─────────────────────────────────────────────────────────────
-- An asset is either an uploaded file (storage_path in the studio-assets
-- bucket) or an external link (url), never neither.
create table if not exists public.studio_asset (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.studio_project(id) on delete set null,
  name          text not null check (char_length(name) between 1 and 200),
  kind          text not null default 'image' check (kind in (
                  'image','video','audio','voice','character','location','vehicle','logo','doc','other')),
  url           text check (url is null or (url ~ '^https://\S+$' and char_length(url) <= 2000)),
  storage_path  text check (storage_path is null or char_length(storage_path) <= 500),
  tags          text[] not null default '{}',
  notes         text check (char_length(notes) <= 2000),
  source        text check (char_length(source) <= 80),
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint studio_asset_has_location check (url is not null or storage_path is not null)
);
comment on table public.studio_asset is
  'Creator Studio asset vault: reference images, characters, locations, voices, logos and finished media. Files live in the private studio-assets bucket; external items keep their https link.';
create index if not exists studio_asset_project_idx on public.studio_asset (project_id, kind);

-- ── Production queue ────────────────────────────────────────────────────────
create table if not exists public.studio_task (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.studio_project(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 300),
  priority    text not null default 'normal' check (priority in ('critical','high','normal','low')),
  status      text not null default 'open' check (status in ('open','in-progress','done')),
  due_date    date,
  sort        smallint not null default 0,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists studio_task_queue_idx on public.studio_task (status, due_date);

create or replace function public.studio_touch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'studio_project' then new.updated_at := now(); end if;
  if tg_table_name = 'studio_task' then
    new.done_at := case when new.status = 'done' then coalesce(new.done_at, now()) else null end;
  end if;
  return new;
end $$;
revoke execute on function public.studio_touch() from public, anon, authenticated;

drop trigger if exists studio_project_touch on public.studio_project;
create trigger studio_project_touch before update on public.studio_project
  for each row execute function public.studio_touch();
drop trigger if exists studio_task_touch on public.studio_task;
create trigger studio_task_touch before insert or update on public.studio_task
  for each row execute function public.studio_touch();

-- ── RLS: staff read/write, super_admin deletes ──────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['studio_project','studio_asset','studio_task'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.current_user_role() in (''trainer'',''super_admin''))', t || '_staff_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.current_user_role() in (''trainer'',''super_admin''))', t || '_staff_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.current_user_role() in (''trainer'',''super_admin'')) with check (public.current_user_role() in (''trainer'',''super_admin''))', t || '_staff_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.current_user_role() = ''super_admin'')', t || '_admin_delete', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ── Private file storage for the vault ──────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-assets', 'studio-assets', false, 52428800, array[
  'image/png','image/jpeg','image/webp','image/gif',
  'video/mp4','video/quicktime','video/webm',
  'audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/webm',
  'application/pdf','text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists studio_assets_staff_read on storage.objects;
create policy studio_assets_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'studio-assets' and public.current_user_role() in ('trainer','super_admin'));
drop policy if exists studio_assets_staff_insert on storage.objects;
create policy studio_assets_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'studio-assets' and public.current_user_role() in ('trainer','super_admin'));
drop policy if exists studio_assets_admin_delete on storage.objects;
create policy studio_assets_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'studio-assets' and public.current_user_role() = 'super_admin');

-- ── Module registration ─────────────────────────────────────────────────────
insert into core.module (key, name, description, schema_name, category, status, sort_order)
values ('growth.studio', 'Creator Studio',
        'Production workspace: projects, asset vault and production queue, fed by Campaign Studio',
        'public', 'crm', 'BETA', 61)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, schema_name = excluded.schema_name,
  category = excluded.category, status = excluded.status, sort_order = excluded.sort_order;

insert into core.tenant_module (tenant_id, module_key, enabled)
select t.id, 'growth.studio', true from core.tenant t where t.slug = 'cts'
on conflict (tenant_id, module_key) do update set enabled = true;
