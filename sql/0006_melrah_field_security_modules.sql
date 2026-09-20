-- MELRAH FIELD v1.1 — security + module activation
-- Applied to production on 2026-09-19. Kept here so database state is reproducible.

insert into core.module (key,name,description,schema_name,category,status,sort_order)
values
('logistics.dispatch','Operations Control','Dispatch queue, capacity alerts and field-resource control','melrah','logistics','AVAILABLE',42),
('logistics.field','MELRAH FIELD','Mobile field collection workflow','melrah','logistics','AVAILABLE',44),
('logistics.stations','Collection Stations','Collection stations, containers and QR assets','melrah','logistics','AVAILABLE',46),
('logistics.recovery','Recovery Intelligence','Recovery, contamination and final-disposition intelligence','melrah','logistics','AVAILABLE',48)
on conflict (key) do update set
 name=excluded.name, description=excluded.description, schema_name=excluded.schema_name,
 category=excluded.category, status=excluded.status, sort_order=excluded.sort_order;

insert into core.tenant_module (tenant_id,module_key,enabled)
select t.id,m.key,true
from core.tenant t
cross join (values ('logistics.dispatch'),('logistics.field'),('logistics.stations'),('logistics.recovery')) m(key)
where t.slug='melrah'
on conflict (tenant_id,module_key) do update set enabled=true;

alter table melrah.service_location enable row level security;
alter table melrah.collection_station enable row level security;
alter table melrah.collection_container enable row level security;
alter table melrah.field_resource enable row level security;
alter table melrah.service_appointment enable row level security;
alter table melrah.collection_record enable row level security;
alter table melrah.material_batch enable row level security;
alter table melrah.batch_collection_record enable row level security;
alter table melrah.station_status_snapshot enable row level security;

do $$
declare tbl text;
begin
 foreach tbl in array array['service_location','collection_station','collection_container','field_resource','service_appointment','collection_record','material_batch','batch_collection_record','station_status_snapshot']
 loop
   execute format('drop policy if exists melrah_member_access on melrah.%I',tbl);
   execute format('create policy melrah_member_access on melrah.%I for all to authenticated using (core.member_of(core.tenant_id(''melrah''))) with check (core.member_of(core.tenant_id(''melrah'')))',tbl);
 end loop;
end $$;

grant usage on schema melrah to authenticated;
grant select,insert,update,delete on melrah.service_location,melrah.collection_station,melrah.collection_container,melrah.field_resource,melrah.service_appointment,melrah.collection_record,melrah.material_batch,melrah.batch_collection_record,melrah.station_status_snapshot to authenticated;
grant select on melrah.dispatch_queue to authenticated;
