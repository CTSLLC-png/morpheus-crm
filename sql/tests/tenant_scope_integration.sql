-- Tenant isolation for Creator Studio, Campaign Studio and Artist Hub.
-- Run after the bootstrap, the module migrations, the seed and 0021.
\set ON_ERROR_STOP on

-- Re-running the migration must be harmless.
\i sql/0021_tenant_scope_growth_modules.sql

-- ── Existing rows were filed under CTS without being rewritten ──────────────
do $$
declare n int;
begin
  select count(*) into n from public.studio_project where tenant_id <> '00000000-0000-0000-0000-0000000000c1';
  assert n = 0, 'existing studio projects must belong to CTS';
  select count(*) into n from public.music_artist where tenant_id <> '00000000-0000-0000-0000-0000000000c1';
  assert n = 0, 'existing artists must belong to CTS';
  select count(*) into n from public.growth_campaign_asset where status = 'draft';
  assert n = 1, 'campaign asset must be untouched';
end $$;

-- Helper: act as a signed-in user with a role.
create or replace function pg_temp.act(uid text, r text) returns void language sql as $$
  select set_config('test.uid', uid, false), set_config('test.role', r, false), null::void
$$;

-- ── The other client's trainer sees nothing of CTS and cannot write into it ─
select pg_temp.act('22222222-2222-2222-2222-222222222222', 'trainer');
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.studio_project; assert n = 0, 'other tenant must not read CTS projects';
  select count(*) into n from public.studio_task;    assert n = 0, 'other tenant must not read CTS tasks';
  select count(*) into n from public.studio_asset;   assert n = 0, 'other tenant must not read CTS assets';
  select count(*) into n from public.growth_campaign_asset; assert n = 0, 'other tenant must not read CTS campaigns';
  select count(*) into n from public.music_take;     assert n = 0, 'other tenant must not read CTS takes';
  select count(*) into n from storage.objects;       assert n = 0, 'other tenant must not read CTS vault files';

  update public.studio_project set title = 'hijacked';
  get diagnostics n = row_count; assert n = 0, 'other tenant must not update CTS projects';

  begin
    insert into public.studio_project (title, tenant_id) values ('sneak', '00000000-0000-0000-0000-0000000000c1');
    assert false, 'other tenant inserted a CTS project';
  exception when insufficient_privilege then null; end;

  -- With no tenant_id given, the default resolves to CTS only for CTS members,
  -- so an outsider's insert is refused instead of landing in CTS.
  begin
    insert into public.studio_project (title) values ('no tenant');
    assert false, 'insert without tenant_id must fail for a non-CTS member';
  exception when not_null_violation or insufficient_privilege then null; end;

  begin
    insert into storage.objects (bucket_id, name) values ('studio-assets', 'renders/sneak.mp4');
    assert false, 'other tenant uploaded into the CTS vault';
  exception when insufficient_privilege then null; end;
end $$;

-- Its own tenant works normally.
do $$
declare pid uuid;
begin
  insert into public.studio_project (title, tenant_id) values ('Other project', '00000000-0000-0000-0000-0000000000b2') returning id into pid;
  insert into public.studio_task (project_id, title, tenant_id) values (pid, 'Plan', '00000000-0000-0000-0000-0000000000b2');
  insert into storage.objects (bucket_id, name)
    values ('studio-assets', '00000000-0000-0000-0000-0000000000b2/22222222-2222-2222-2222-222222222222/a.png');
  perform 1 from public.studio_project where id = pid;
  assert found, 'other tenant must read its own project';

  -- A child cannot point at a parent in another tenant (the CTS project).
  begin
    insert into public.studio_task (project_id, title, tenant_id)
      values ('bbbbbbbb-0000-0000-0000-000000000001', 'cross', '00000000-0000-0000-0000-0000000000b2');
    assert false, 'task attached to another tenant''s project';
  exception when insufficient_privilege then null; end;
end $$;

-- Published Artist Hub pages stay readable by any signed-in user and anon.
do $$
declare n int;
begin
  select count(*) into n from public.music_artist where slug = 'jace';
  assert n = 1, 'signed-in users outside CTS must still see a published artist page';
end $$;
reset role;
set role anon;
do $$
declare n int;
begin
  select count(*) into n from public.music_artist where slug = 'jace';
  assert n = 1, 'anon must still see a published artist page';
end $$;
reset role;

-- ── A trainer with no tenant at all is locked out ───────────────────────────
select pg_temp.act('33333333-3333-3333-3333-333333333333', 'trainer');
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.studio_project; assert n = 0, 'trainer without a tenant must see no projects';
end $$;
reset role;

-- ── The CTS trainer keeps full access to CTS work, none to the other client ─
select pg_temp.act('11111111-1111-1111-1111-111111111111', 'trainer');
set role authenticated;
do $$
declare n int; pid uuid;
begin
  select count(*) into n from public.studio_project; assert n = 1, 'CTS trainer must see exactly the CTS project, got ' || n;
  select count(*) into n from storage.objects; assert n = 2, 'CTS trainer must see the 2 legacy CTS vault files, got ' || n;
  update public.studio_project set stage = 'production' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics n = row_count; assert n = 1, 'CTS trainer must update CTS projects';

  -- Default tenant works for CTS members, so existing app code keeps working.
  insert into public.studio_project (title) values ('Defaulted') returning id into pid;
  perform 1 from public.studio_project where id = pid and tenant_id = '00000000-0000-0000-0000-0000000000c1';
  assert found, 'default tenant must be CTS for a CTS member';

  insert into storage.objects (bucket_id, name)
    values ('studio-assets', '00000000-0000-0000-0000-0000000000c1/11111111-1111-1111-1111-111111111111/b.png');

  begin
    update public.studio_project set tenant_id = '00000000-0000-0000-0000-0000000000b2' where id = pid;
    assert false, 'tenant_id was changed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ── A user in both tenants sees both, and still cannot move rows ────────────
select pg_temp.act('44444444-4444-4444-4444-444444444444', 'super_admin');
set role authenticated;
do $$
declare n int;
begin
  select count(distinct tenant_id) into n from public.studio_project; assert n = 2, 'admin of both tenants must see both';
  begin
    update public.studio_project set tenant_id = '00000000-0000-0000-0000-0000000000b2'
      where id = 'bbbbbbbb-0000-0000-0000-000000000001';
    assert false, 'a member of both tenants moved a project between them';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'tenant scope: all checks passed' as result;
