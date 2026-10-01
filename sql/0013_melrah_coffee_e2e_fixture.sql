-- MELRAH ORGANICS COFFEE — controlled E2E test fixture
-- Idempotent. Creates a synthetic Schenectady-area coffee generator, station,
-- container and work order. It does NOT assign a real driver automatically.
begin;

insert into melrah.service_location
(name,address1,city,state,postal_code,contact_name,active,notes,program_key)
select 'TEST — Melrah Coffee Pilot Generator','100 Test Route','Schenectady','NY','12305',
       'Melrah Pilot Operations',true,'CONTROLLED TEST FIXTURE — not a customer','ORGANICS_COFFEE'
where not exists(select 1 from melrah.service_location where name='TEST — Melrah Coffee Pilot Generator');

insert into melrah.collection_station(location_id,station_code,station_name,status,installed_at,notes,program_key)
select l.id,'TEST-SCH-COFFEE-001','TEST Coffee Grounds Station','ACTIVE',now(),
       'CONTROLLED TEST FIXTURE','ORGANICS_COFFEE'
from melrah.service_location l
where l.name='TEST — Melrah Coffee Pilot Generator'
and not exists(select 1 from melrah.collection_station where station_code='TEST-SCH-COFFEE-001');

insert into melrah.collection_container(station_id,container_code,material_stream,capacity_liters,qr_value,active,program_key)
select s.id,'MEL-SCH-TEST-CG-01','COFFEE_GROUNDS',20,'MEL-SCH-TEST-CG-01',true,'ORGANICS_COFFEE'
from melrah.collection_station s
where s.station_code='TEST-SCH-COFFEE-001'
and not exists(select 1 from melrah.collection_container where container_code='MEL-SCH-TEST-CG-01');

insert into melrah.work_order
(tenant_id,wo_number,wo_type,status,scheduled_for,route,location_id,priority,dispatch_notes,program_key)
select core.tenant_id('melrah'),'TEST-COFFEE-0001','COLLECTION','DRAFT',current_date,
       'TEST — Schenectady Coffee Pilot',l.id,'NORMAL',
       'Controlled ORGANICS_COFFEE E2E validation. Assign through Dispatch UI.','ORGANICS_COFFEE'
from melrah.service_location l
where l.name='TEST — Melrah Coffee Pilot Generator'
and not exists(select 1 from melrah.work_order where wo_number='TEST-COFFEE-0001');

insert into melrah.station_status_snapshot(container_id,fill_level_pct,source,captured_at)
select c.id,75,'MANUAL',now()
from melrah.collection_container c
where c.container_code='MEL-SCH-TEST-CG-01'
and not exists(
 select 1 from melrah.station_status_snapshot s
 where s.container_id=c.id and s.source='MANUAL'
);

insert into melrah.custody_event(work_order_id,event_type,occurred_at,actor,note)
select w.id,'TEST_FIXTURE_CREATED',now(),'MorpheusOS',
       'Controlled ORGANICS_COFFEE E2E fixture — dispatch assignment required'
from melrah.work_order w
where w.wo_number='TEST-COFFEE-0001'
and not exists(select 1 from melrah.custody_event c where c.work_order_id=w.id and c.event_type='TEST_FIXTURE_CREATED');

commit;

-- Expected validation:
-- 1. Dispatch queue shows TEST-COFFEE-0001 with ORGANICS badge and ~75% fill.
-- 2. Assign to a real test collector using Operations Control.
-- 3. Collector Route Briefcase shows ORGANICS and QR MEL-SCH-TEST-CG-01.
-- 4. Record weight + contamination + replacement container as applicable.
-- 5. Confirm collection_record.program_key='ORGANICS_COFFEE'.
-- 6. Confirm COLLECTION_RECORDED custody event.
-- 7. Confirm Recovery Intelligence coffee-ground pounds increase.
