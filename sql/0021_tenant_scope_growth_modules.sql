-- Tenant isolation for the growth and media modules.
--
-- Before this migration Creator Studio (studio_*), Campaign Studio
-- (growth_campaign_asset) and Artist Hub (music_*) had no tenant column and
-- their RLS checked only the role, so a trainer in any Morpheus tenant could
-- read and edit every tenant's rows. This migration:
--
--   1. adds tenant_id (not null, references core.tenant) to every table,
--      filling existing rows with the CTS tenant without rewriting them
--      (no UPDATE runs, so no row trigger such as the campaign review gate fires);
--   2. adds RESTRICTIVE policies that AND a membership check onto the existing
--      role policies, so the role rules (trainer/super_admin, super_admin-only
--      delete, the campaign approval gate, Artist Hub public pages) are untouched;
--   3. pins tenant_id: it cannot be changed after insert, and a child row must
--      belong to the same tenant as its parent;
--   4. scopes the private studio-assets bucket by tenant folder.
--
-- public.apply_tenant_scope() is the reusable piece: a later module migration
-- calls it for its own tables (for example studio_render_job) to get the same
-- column, policies and triggers. It is not callable by app users.
--
-- Re-runnable. Requires core.tenant('cts'), core.member_of(uuid) and
-- core.tenant_id(text) from the Morpheus kernel.

-- ── 0. Preflight ────────────────────────────────────────────────────────────
do $$
declare
  cts uuid;
  orphans int;
begin
  select id into cts from core.tenant where slug = 'cts';
  if cts is null then
    raise exception 'tenant scope: core.tenant row with slug cts is missing';
  end if;

  -- Anyone who has created rows in these modules must already be a CTS
  -- member, or the new membership check would lock them out of their work.
  -- Fix by adding them to core.membership (or removing their rows) first.
  select count(distinct u) into orphans from (
    select created_by as u from public.studio_project
    union select created_by from public.growth_campaign_asset
  ) c
  where u is not null
    and not exists (select 1 from core.membership m where m.user_id = c.u and m.tenant_id = cts);
  if orphans > 0 then
    raise exception 'tenant scope: % user(s) created Creator/Campaign Studio rows but are not CTS members in core.membership', orphans;
  end if;
end $$;

-- ── 1. Helpers ──────────────────────────────────────────────────────────────

-- Rejects a tenant change, and a child whose parent is in another tenant.
-- TG_ARGV: [0] parent table in public (optional), [1] the child's FK column.
-- SECURITY DEFINER so the parent lookup is not hidden by RLS: a parent the
-- caller cannot see must still be compared, not silently treated as missing.
create or replace function public.tenant_scope_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  parent_id  uuid;
  parent_tid uuid;
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id cannot be changed on %', tg_table_name using errcode = '42501';
  end if;
  if tg_nargs >= 2 then
    parent_id := (to_jsonb(new) ->> tg_argv[1])::uuid;
    if parent_id is not null then
      execute format('select tenant_id from public.%I where id = $1', tg_argv[0])
        into parent_tid using parent_id;
      if parent_tid is distinct from new.tenant_id then
        raise exception '% row must be in the same tenant as its %', tg_table_name, tg_argv[0]
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.tenant_scope_guard() from public, anon, authenticated;

-- Adds tenant scoping to one public table. p_public_read is an extra SELECT
-- condition for rows anyone may read (Artist Hub fan pages); leave it null
-- for private tables.
create or replace function public.apply_tenant_scope(
  p_table text, p_parent text default null, p_fk text default null, p_public_read text default null)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  cts uuid;
  read_qual text;
begin
  select id into cts from core.tenant where slug = 'cts';
  if cts is null then raise exception 'apply_tenant_scope: tenant cts is missing'; end if;

  -- A constant default fills existing rows without an UPDATE; the default is
  -- then switched to core.tenant_id('cts'), which is NULL for a non-member,
  -- so an outsider's insert fails the NOT NULL instead of landing in CTS.
  execute format('alter table public.%I add column if not exists tenant_id uuid not null default %L references core.tenant(id)', p_table, cts);
  execute format('alter table public.%I alter column tenant_id set default core.tenant_id(%L)', p_table, 'cts');
  execute format('create index if not exists %I on public.%I (tenant_id)', p_table || '_tenant_idx', p_table);

  read_qual := 'core.member_of(tenant_id)' || coalesce(' or (' || p_public_read || ')', '');
  execute format('drop policy if exists %I on public.%I', p_table || '_tenant_read', p_table);
  execute format('create policy %I on public.%I as restrictive for select to authenticated using (%s)',
                 p_table || '_tenant_read', p_table, read_qual);
  execute format('drop policy if exists %I on public.%I', p_table || '_tenant_insert', p_table);
  execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (core.member_of(tenant_id))',
                 p_table || '_tenant_insert', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_tenant_update', p_table);
  execute format('create policy %I on public.%I as restrictive for update to authenticated using (core.member_of(tenant_id)) with check (core.member_of(tenant_id))',
                 p_table || '_tenant_update', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_tenant_delete', p_table);
  execute format('create policy %I on public.%I as restrictive for delete to authenticated using (core.member_of(tenant_id))',
                 p_table || '_tenant_delete', p_table);

  execute format('drop trigger if exists %I on public.%I', p_table || '_tenant_guard', p_table);
  if p_parent is null then
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.tenant_scope_guard()',
                   p_table || '_tenant_guard', p_table);
  else
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.tenant_scope_guard(%L, %L)',
                   p_table || '_tenant_guard', p_table, p_parent, p_fk);
  end if;
end $$;
revoke execute on function public.apply_tenant_scope(text, text, text, text) from public, anon, authenticated;

-- ── 2. Apply to the modules (parents before children) ───────────────────────
do $$ begin
  perform public.apply_tenant_scope('growth_campaign_asset');
  perform public.apply_tenant_scope('studio_project', 'growth_campaign_asset', 'campaign_asset_id');
  perform public.apply_tenant_scope('studio_task',    'studio_project', 'project_id');
  perform public.apply_tenant_scope('studio_asset',   'studio_project', 'project_id');
  perform public.apply_tenant_scope('music_artist',   null, null, 'is_public');
  perform public.apply_tenant_scope('music_release',  'music_artist',  'artist_id',  'is_public');
  perform public.apply_tenant_scope('music_track',    'music_release', 'release_id', 'is_public');
  perform public.apply_tenant_scope('music_take',     'music_track',   'track_id');
  perform public.apply_tenant_scope('music_video',    'music_artist',  'artist_id',  'is_public');
end $$;

-- One Creator Studio project per campaign asset stays global: the asset id is
-- already unique and the guard keeps both rows in one tenant.

-- ── 3. Private vault bucket, scoped by tenant folder ────────────────────────
-- New browser uploads go to <tenant_id>/<user_id>/<file>. Older paths
-- (<user_id>/... and the render worker's renders/...) belong to CTS.
-- SECURITY DEFINER so a folder naming another tenant is recognised as that
-- tenant even when the caller cannot see its core.tenant row.
create or replace function public.studio_path_tenant(p_name text)
returns uuid language plpgsql stable security definer set search_path = core, public, pg_temp as $$
declare
  head text := split_part(p_name, '/', 1);
  tid uuid;
begin
  if head ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into tid from core.tenant where id = head::uuid;
    if tid is not null then return tid; end if;
  end if;
  select id into tid from core.tenant where slug = 'cts';
  return tid;
end $$;
revoke execute on function public.studio_path_tenant(text) from public, anon;
grant execute on function public.studio_path_tenant(text) to authenticated;

drop policy if exists studio_assets_staff_read on storage.objects;
create policy studio_assets_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'studio-assets' and public.current_user_role() in ('trainer','super_admin')
         and core.member_of(public.studio_path_tenant(name)));
drop policy if exists studio_assets_staff_insert on storage.objects;
create policy studio_assets_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'studio-assets' and public.current_user_role() in ('trainer','super_admin')
              and core.member_of(public.studio_path_tenant(name)));
drop policy if exists studio_assets_admin_delete on storage.objects;
create policy studio_assets_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'studio-assets' and public.current_user_role() = 'super_admin'
         and core.member_of(public.studio_path_tenant(name)));
