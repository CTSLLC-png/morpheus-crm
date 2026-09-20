-- MELRAH FIELD v2.5 — multi-program recovery migration
-- Apply after sql/melrah_field_v1.sql.
-- Adds coffee organics without changing the existing cannabis workflow.

alter table melrah.service_location
  add column if not exists program_key text not null default 'CANNABIS_PACKAGING'
  check (program_key in ('CANNABIS_PACKAGING','ORGANICS_COFFEE','MIXED'));

alter table melrah.collection_station
  add column if not exists program_key text not null default 'CANNABIS_PACKAGING'
  check (program_key in ('CANNABIS_PACKAGING','ORGANICS_COFFEE','MIXED'));

alter table melrah.collection_container
  add column if not exists program_key text not null default 'CANNABIS_PACKAGING'
  check (program_key in ('CANNABIS_PACKAGING','ORGANICS_COFFEE'));

alter table melrah.work_order
  add column if not exists program_key text not null default 'CANNABIS_PACKAGING'
  check (program_key in ('CANNABIS_PACKAGING','ORGANICS_COFFEE'));

alter table melrah.collection_record
  add column if not exists program_key text not null default 'CANNABIS_PACKAGING'
  check (program_key in ('CANNABIS_PACKAGING','ORGANICS_COFFEE'));

alter table melrah.collection_record
  add column if not exists contamination_level text
  check (contamination_level is null or contamination_level in ('NONE','MINOR','MAJOR','REJECT'));

alter table melrah.collection_record add column if not exists replacement_container_code text;
alter table melrah.collection_record add column if not exists service_minutes numeric(8,2)
  check (service_minutes is null or service_minutes >= 0);

alter table melrah.material_batch
  add column if not exists program_key text not null default 'CANNABIS_PACKAGING'
  check (program_key in ('CANNABIS_PACKAGING','ORGANICS_COFFEE'));

-- Extend the v1 material-stream constraint for the organics profile.
alter table melrah.collection_container drop constraint if exists collection_container_material_stream_check;
alter table melrah.collection_container add constraint collection_container_material_stream_check
  check (material_stream in (
    'FLEXIBLE_POUCH','RIGID_PLASTIC','GLASS_METAL','PAPER_FIBER','OTHER',
    'COFFEE_GROUNDS','COFFEE_GROUNDS_FILTERS'
  ));

create index if not exists idx_melrah_work_order_program on melrah.work_order(program_key,status,scheduled_for);
create index if not exists idx_melrah_collection_program on melrah.collection_record(program_key,recorded_at);

create or replace view melrah.program_recovery_summary as
select
  program_key,
  count(*) as collection_count,
  coalesce(sum(weight_lbs),0) as recovered_weight_lbs,
  coalesce(avg(contamination_pct),0) as avg_contamination_pct,
  coalesce(avg(service_minutes),0) as avg_service_minutes
from melrah.collection_record
group by program_key;
