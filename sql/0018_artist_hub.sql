-- Artist Hub — Morpheus-native music catalog (artists, releases, tracks, videos)
-- and the public artist pages served on <artist>.morpheuscr.com.
-- First artist: Jace Carter (jace.morpheuscr.com).
--
-- Public visitors (anon) can read ONLY rows marked is_public, and only the
-- columns a fan page needs. Working takes (Suno links, generation notes) live
-- in music_take, which anon can never read. Staff (trainer, super_admin)
-- read/write everything; deletes are super_admin only.

-- ── Artists ─────────────────────────────────────────────────────────────────
create table if not exists public.music_artist (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name        text not null check (char_length(name) between 1 and 120),
  tagline     text check (char_length(tagline) <= 300),
  bio         text check (char_length(bio) <= 5000),
  genre       text check (char_length(genre) <= 80),
  label       text check (char_length(label) <= 120),
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Releases (albums, singles) ──────────────────────────────────────────────
create table if not exists public.music_release (
  id            uuid primary key default gen_random_uuid(),
  artist_id     uuid not null references public.music_artist(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  kind          text not null default 'album' check (kind in ('album','ep','single')),
  status        text not null default 'in-production' check (status in (
                  'in-production','mastering','scheduled','released','on-hold')),
  release_date  date,
  summary       text check (char_length(summary) <= 3000),
  cover_url     text check (cover_url is null or (cover_url ~ '^https://\S+$' and char_length(cover_url) <= 2000)),
  is_public     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (artist_id, title)
);

-- ── Tracks ──────────────────────────────────────────────────────────────────
create table if not exists public.music_track (
  id          uuid primary key default gen_random_uuid(),
  release_id  uuid not null references public.music_release(id) on delete cascade,
  track_no    smallint not null check (track_no between 1 and 99),
  title       text not null check (char_length(title) between 1 and 200),
  role        text check (char_length(role) <= 300),
  target_bpm  smallint check (target_bpm between 30 and 240),
  status      text not null default 'generated' check (status in (
                'writing','generated','keeper-selected','mastered','released')),
  listen_url  text check (listen_url is null or (listen_url ~ '^https://\S+$' and char_length(listen_url) <= 2000)),
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (release_id, track_no)
);

-- ── Working takes — STAFF ONLY, never public ────────────────────────────────
create table if not exists public.music_take (
  id          uuid primary key default gen_random_uuid(),
  track_id    uuid not null references public.music_track(id) on delete cascade,
  source      text not null default 'suno' check (char_length(source) <= 40),
  take_url    text not null check (take_url ~ '^https://\S+$' and char_length(take_url) <= 2000),
  duration    text check (char_length(duration) <= 10),
  model       text check (char_length(model) <= 60),
  is_keeper   boolean not null default false,
  notes       text check (char_length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  unique (track_id, take_url)
);
create unique index if not exists music_take_one_keeper
  on public.music_take (track_id) where is_keeper;

-- ── Videos (music videos, Shorts, lyric videos) ─────────────────────────────
create table if not exists public.music_video (
  id          uuid primary key default gen_random_uuid(),
  artist_id   uuid not null references public.music_artist(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  kind        text not null default 'music-video' check (kind in ('music-video','short','lyric-video','teaser')),
  youtube_id  text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel     text check (char_length(channel) <= 120),
  sort        smallint not null default 0,
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (artist_id, youtube_id)
);

create or replace function public.music_touch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at := now(); return new; end $$;
revoke execute on function public.music_touch() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['music_artist','music_release','music_track'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.music_touch()', t || '_touch', t);
  end loop;
end $$;

-- ── RLS: staff read/write, super_admin deletes ──────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['music_artist','music_release','music_track','music_take','music_video'] loop
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

-- ── Public read: published rows only, fan-page columns only ─────────────────
-- music_take is deliberately absent: anon has no grant and no policy on it.
drop policy if exists music_artist_public_read on public.music_artist;
create policy music_artist_public_read on public.music_artist for select to anon, authenticated
  using (is_public);
drop policy if exists music_release_public_read on public.music_release;
create policy music_release_public_read on public.music_release for select to anon, authenticated
  using (is_public and exists (select 1 from public.music_artist a where a.id = artist_id and a.is_public));
drop policy if exists music_track_public_read on public.music_track;
create policy music_track_public_read on public.music_track for select to anon, authenticated
  using (is_public and exists (select 1 from public.music_release r where r.id = release_id and r.is_public));
drop policy if exists music_video_public_read on public.music_video;
create policy music_video_public_read on public.music_video for select to anon, authenticated
  using (is_public and exists (select 1 from public.music_artist a where a.id = artist_id and a.is_public));

grant select (id, slug, name, tagline, bio, genre, label, is_public) on public.music_artist to anon;
grant select (id, artist_id, title, kind, status, release_date, summary, cover_url, is_public) on public.music_release to anon;
grant select (id, release_id, track_no, title, role, status, listen_url, is_public) on public.music_track to anon;
grant select (id, artist_id, title, kind, youtube_id, channel, sort, is_public) on public.music_video to anon;

-- ── Module registration ─────────────────────────────────────────────────────
insert into core.module (key, name, description, schema_name, category, status, sort_order)
values ('media.artist', 'Artist Hub',
        'Music catalog and public artist pages (releases, tracks, keeper takes, videos). First artist: Jace Carter.',
        'public', 'crm', 'AVAILABLE', 62)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, schema_name = excluded.schema_name,
  category = excluded.category, status = excluded.status, sort_order = excluded.sort_order;

insert into core.tenant_module (tenant_id, module_key, enabled)
select t.id, 'media.artist', true from core.tenant t where t.slug = 'cts'
on conflict (tenant_id, module_key) do update set enabled = true;

-- ── Seed: Jace Carter · The Hands That Hold America ─────────────────────────
-- Tracks stay private (is_public = false) until each is mastered; the release
-- and track list are public so the fan page can show what is coming.
insert into public.music_artist (slug, name, tagline, bio, genre, label, is_public)
values ('jace', 'Jace Carter',
  'Country storyteller for the people who keep this country running.',
  'Jace Carter sings about working people, family, community and an America with room at the table for everyone. His debut single "Build It Back Home" asks a simple question: what if rebuilding America starts closer to home?',
  'Country · Country-soul', 'Melrah Entertainment', true)
on conflict (slug) do update set name = excluded.name, tagline = excluded.tagline, bio = excluded.bio,
  genre = excluded.genre, label = excluded.label;

insert into public.music_release (artist_id, title, kind, status, summary, is_public)
select a.id, 'The Hands That Hold America', 'album', 'in-production',
  'Ten original songs about work, family, love that survives lean years, grief carried with dignity, and a country big enough for every neighbor.',
  true
from public.music_artist a where a.slug = 'jace'
on conflict (artist_id, title) do nothing;

with r as (
  select rel.id from public.music_release rel join public.music_artist a on a.id = rel.artist_id
  where a.slug = 'jace' and rel.title = 'The Hands That Hold America'
)
insert into public.music_track (release_id, track_no, title, role, target_bpm, status)
select r.id, v.n, v.title, v.role, v.bpm, v.status from r, (values
  (1,  'The Hands That Hold America',  'Opening anthem',                    100, 'keeper-selected'),
  (2,  'Robbing Peter to Pay Paul',    'Lead single',                        88, 'keeper-selected'),
  (3,  'Steel-Toe Saturday',           'Honky-tonk weekend release',        118, 'generated'),
  (4,  'Your Porch Light',             'Love ballad',                        72, 'generated'),
  (5,  'One America, One Table',       'Community anthem',                   96, 'keeper-selected'),
  (6,  'Kitchen Floor Waltz',          'Romantic waltz',                     78, 'keeper-selected'),
  (7,  'Before Your Time',             'Father-daughter ballad',             64, 'keeper-selected'),
  (8,  'A Flag Needs Hands',           'Patriotism through service',         84, 'keeper-selected'),
  (9,  'I''d Still Choose You',        'Lasting-love ballad',                70, 'keeper-selected'),
  (10, 'Tomorrow''s Got My Name on It', 'Hopeful closer',                    104, 'keeper-selected')
) as v(n, title, role, bpm, status)
on conflict (release_id, track_no) do nothing;

-- Working takes (staff only). Keeper = the take liked in Suno on 2026-10-13.
with t as (
  select tr.id, tr.track_no from public.music_track tr
  join public.music_release rel on rel.id = tr.release_id
  join public.music_artist a on a.id = rel.artist_id
  where a.slug = 'jace' and rel.title = 'The Hands That Hold America'
)
insert into public.music_take (track_id, take_url, duration, model, is_keeper)
select t.id, 'https://suno.com/song/' || v.song, v.dur, 'Suno v6', v.keeper from t join (values
  (1,  '324c9f34-d184-4554-af66-70da90f22bcc', '4:03', true),
  (1,  '04a37e83-c6b1-4264-9cb2-388f42d93ef4', '4:09', false),
  (1,  'd87181e0-105d-4e2a-a5ce-b2eb3dc2de96', '4:10', false),
  (1,  'd5585139-1303-4687-97cb-02b06c1d9b02', '4:09', false),
  (2,  '63f0d2c3-1b85-482b-a7cf-775d2da1ce2e', '3:28', true),
  (2,  '5c8417e3-635d-4899-9b0c-857e9791aa64', '3:39', false),
  (3,  'bf74e2cf-1eaf-4b9a-a1a5-171cc5e917dc', '2:38', false),
  (3,  '6e47dfcd-b81b-4ade-ae9c-315aa95aec25', '2:55', false),
  (4,  '3a9a9134-57f6-41be-bd78-fdda08b0f379', '3:34', false),
  (4,  'a14b6821-ee31-4467-8533-05bcee08cc67', '3:24', false),
  (5,  '720dd24a-df5d-4484-be18-74e961b36382', '3:18', true),
  (5,  '8d2a43c7-2d77-4e67-990f-3c1c5be1c648', '3:27', false),
  (6,  '4b74e8ac-1fa0-4361-910f-502573eda05c', '3:59', true),
  (6,  'b18dbe70-d094-43aa-af6e-8126ddd51e3e', '3:50', false),
  (7,  '2e32e55f-cc8c-46b5-8a3a-a4c76a0f1931', '4:19', true),
  (7,  'fd561fcd-54ab-4c7e-8139-0d75a3d4c0cb', '4:14', false),
  (8,  '189fe208-605c-46ca-92d7-8fe930a65c7d', '3:04', true),
  (8,  'ccfd156d-3740-4ab7-b70d-b68b803fb329', '3:14', false),
  (9,  'e974ecc5-7146-4c22-a717-53c4e5709fc8', '3:37', true),
  (9,  '412bf9bf-3c2d-4741-bbe0-34ff5f95c454', '3:43', false),
  (10, '4e9d60ef-d828-4287-bef1-1bba805d5874', '2:47', true),
  (10, 'c0539066-f2ea-406e-91e5-20250756ef7c', '3:17', false)
) as v(n, song, dur, keeper) on v.n = t.track_no
on conflict (track_id, take_url) do nothing;

insert into public.music_video (artist_id, title, kind, youtube_id, channel, sort, is_public)
select a.id, v.title, v.kind, v.yt, 'Pragmatic Thinking', v.sort, true
from public.music_artist a, (values
  ('Build It Back Home — Official Music Video (Premium Edition)', 'music-video', 'f9Maz5WG91s', 1)
) as v(title, kind, yt, sort)
where a.slug = 'jace'
on conflict (artist_id, youtube_id) do nothing;
