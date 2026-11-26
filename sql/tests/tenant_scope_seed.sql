-- Rows that exist before 0021 runs, as in production: everything is CTS work.
-- Run after the bootstrap and the module migrations, before 0021.
insert into auth.users (id, raw_app_meta_data) values
  ('11111111-1111-1111-1111-111111111111', '{"role":"trainer"}'),      -- CTS trainer
  ('22222222-2222-2222-2222-222222222222', '{"role":"trainer"}'),      -- other client's trainer
  ('33333333-3333-3333-3333-333333333333', '{"role":"trainer"}'),      -- trainer with no tenant
  ('44444444-4444-4444-4444-444444444444', '{"role":"super_admin"}')   -- admin of both tenants
on conflict do nothing;
insert into core.membership (user_id, tenant_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c1', 'staff'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b2', 'staff'),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-0000000000c1', 'admin'),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-0000000000b2', 'admin')
on conflict do nothing;

insert into public.growth_campaign_asset (id, campaign, channel, title, body, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'spring-launch', 'email', 'CTS email', 'Body', '11111111-1111-1111-1111-111111111111');
insert into public.studio_project (id, title, campaign_asset_id, created_by) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'CTS explainer', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
insert into public.studio_task (project_id, title) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Write script');
insert into public.studio_asset (project_id, name, url, created_by) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Logo', 'https://example.com/logo.png', '11111111-1111-1111-1111-111111111111');
insert into storage.objects (bucket_id, name) values
  ('studio-assets', '11111111-1111-1111-1111-111111111111/old-upload.png'),
  ('studio-assets', 'renders/legacy-path/explainer.mp4');
