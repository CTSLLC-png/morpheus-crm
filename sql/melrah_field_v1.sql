-- MELRAH FIELD v1
-- Dispatch, mobile collection, chain-of-custody and recovery intelligence
-- Apply after Morpheus core + existing Melrah schema.

create schema if not exists melrah;

create table if not exists melrah.service_location (
  id uuid primary key default gen_random_uuid(),
  account_id uuid,
  name text not null,
  address1 text,
  address2 text,
  city text,
  state text default 'NY',
  postal_code text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  contact_name text,
  contact_phone text,
  service_window_start time,
  service_window_end time,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists melrah.collection_station (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references melrah.service_location(id) on delete cascade,
  station_code text not null unique,
  station_name text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','MAINTENANCE')),
  installed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists melrah.collection_container (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references melrah.collection_station(id) on delete cascade,
  container_code text not null unique,
  material_stream text not null check (material_stream in ('FLEXIBLE_POUCH','RIGID_PLASTIC','GLASS_METAL','PAPER_FIBER','OTHER')),
  capacity_liters numeric(10,2),
  qr_value text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists melrah.field_resource (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  display_name text not null,
  role text not null default 'DRIVER' check (role in ('DRIVER','DISPATCHER','OPS_MANAGER','PARTNER_VIEWER')),
  phone text,
  vehicle_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table melrah.work_order add column if not exists location_id uuid references melrah.service_location(id) on delete set null;
alter table melrah.work_order add column if not exists priority text default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT'));
alter table melrah.work_order add column if not exists assigned_resource_id uuid references melrah.field_resource(id) on delete set null;
alter table melrah.work_order add column if not exists dispatch_notes text;
alter table melrah.work_order add column if not exists accepted_at timestamptz;
alter table melrah.work_order add column if not exists dispatched_at timestamptz;
alter table melrah.work_order add column if not exists en_route_at timestamptz;
alter table melrah.work_order add column if not exists arrived_at timestamptz;
alter table melrah.work_order add column if not exists collection_started_at timestamptz;
alter table melrah.work_order add column if not exists completed_at timestamptz;
alter table melrah.work_order add column if not exists cancelled_at timestamptz;

create table if not exists melrah.service_appointment (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references melrah.work_order(id) on delete cascade,
  resource_id uuid references melrah.field_resource(id) on delete set null,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status text not null default 'UNASSIGNED' check (status in ('UNASSIGNED','DISPATCHED','ACCEPTED','EN_ROUTE','ARRIVED','IN_PROGRESS','COMPLETED','CANCELLED','EXCEPTION')),
  sequence_no integer,
  route_name text,
  accepted_at timestamptz,
  en_route_at timestamptz,
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  exception_code text,
  exception_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists melrah.collection_record (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references melrah.work_order(id) on delete cascade,
  appointment_id uuid references melrah.service_appointment(id) on delete set null,
  location_id uuid not null references melrah.service_location(id) on delete restrict,
  station_id uuid references melrah.collection_station(id) on delete set null,
  container_id uuid references melrah.collection_container(id) on delete set null,
  material_stream text not null,
  weight_lbs numeric(10,3) check (weight_lbs is null or weight_lbs >= 0),
  package_count integer check (package_count is null or package_count >= 0),
  contamination_pct numeric(5,2) check (contamination_pct is null or (contamination_pct >= 0 and contamination_pct <= 100)),
  fill_level_pct numeric(5,2) check (fill_level_pct is null or (fill_level_pct >= 0 and fill_level_pct <= 100)),
  bag_batch_id text,
  before_photo_url text,
  after_photo_url text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  notes text,
  recorded_by uuid references melrah.field_resource(id) on delete set null,
  recorded_at timestamptz not null default now()
);

create table if not exists melrah.material_batch (
  id uuid primary key default gen_random_uuid(),
  batch_code text not null unique,
  material_stream text not null,
  received_weight_lbs numeric(10,3),
  received_at timestamptz,
  status text not null default 'COLLECTED' check (status in ('COLLECTED','RECEIVED','SORTED','CHARACTERIZED','PROCESSOR_ASSIGNED','TRANSFERRED','FINAL_DISPOSITION')),
  processor_name text,
  processor_reference text,
  final_disposition text,
  disposition_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists melrah.batch_collection_record (
  batch_id uuid not null references melrah.material_batch(id) on delete cascade,
  collection_record_id uuid not null references melrah.collection_record(id) on delete cascade,
  primary key (batch_id, collection_record_id)
);

create table if not exists melrah.station_status_snapshot (
  id uuid primary key default gen_random_uuid(),
  container_id uuid not null references melrah.collection_container(id) on delete cascade,
  fill_level_pct numeric(5,2) not null check (fill_level_pct >= 0 and fill_level_pct <= 100),
  source text not null default 'MANUAL' check (source in ('MANUAL','PARTNER','SENSOR','PREDICTED')),
  captured_at timestamptz not null default now()
);

create or replace view melrah.dispatch_queue as
select
  wo.id,
  wo.wo_number,
  wo.status,
  wo.priority,
  wo.scheduled_for,
  wo.assigned_resource_id,
  sl.name as location_name,
  sl.city,
  sl.service_window_start,
  sl.service_window_end,
  coalesce(max(sss.fill_level_pct),0) as max_fill_pct
from melrah.work_order wo
left join melrah.service_location sl on sl.id = wo.location_id
left join melrah.collection_station cs on cs.location_id = sl.id
left join melrah.collection_container cc on cc.station_id = cs.id
left join lateral (
  select fill_level_pct from melrah.station_status_snapshot s
  where s.container_id = cc.id order by captured_at desc limit 1
) sss on true
where wo.closed_at is null and wo.cancelled_at is null
group by wo.id, sl.name, sl.city, sl.service_window_start, sl.service_window_end;

create index if not exists idx_melrah_appointment_resource_status on melrah.service_appointment(resource_id,status,scheduled_start);
create index if not exists idx_melrah_collection_work_order on melrah.collection_record(work_order_id,recorded_at);
create index if not exists idx_melrah_snapshot_container_time on melrah.station_status_snapshot(container_id,captured_at desc);
