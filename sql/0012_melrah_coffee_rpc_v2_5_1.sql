-- MELRAH FIELD v2.5.1 — program-aware mobile RPC + coffee E2E support
-- Apply after melrah_field_v2_5_multi_program.sql.

drop function if exists public.melrah_field_record_collection(uuid,text,numeric,integer,numeric,numeric,text,text,numeric,numeric);
drop function if exists public.melrah_field_record_collection(uuid,text,numeric,integer,numeric,numeric,text,text,numeric,numeric,text,text,text,text);

create or replace function public.melrah_field_record_collection(
 p_appointment_id uuid,
 p_container_code text,
 p_weight_lbs numeric,
 p_package_count integer,
 p_contamination_pct numeric,
 p_fill_level_pct numeric,
 p_bag_batch_id text,
 p_notes text default null,
 p_latitude numeric default null,
 p_longitude numeric default null,
 p_before_photo_path text default null,
 p_after_photo_path text default null,
 p_program_key text default 'CANNABIS_PACKAGING',
 p_contamination_level text default null,
 p_replacement_container_code text default null)
returns uuid language plpgsql security invoker set search_path=public,melrah,core,pg_temp as $$
declare
 a melrah.service_appointment;
 w melrah.work_order;
 c melrah.collection_container;
 s melrah.collection_station;
 rid uuid;
 actor_name text;
begin
 if not core.member_of(core.tenant_id('melrah')) then raise exception 'not authorized'; end if;
 if p_program_key not in ('CANNABIS_PACKAGING','ORGANICS_COFFEE') then raise exception 'invalid program'; end if;
 if p_contamination_level is not null and p_contamination_level not in ('NONE','MINOR','MAJOR','REJECT') then raise exception 'invalid contamination level'; end if;

 select * into a from melrah.service_appointment where id=p_appointment_id;
 if a.id is null then raise exception 'appointment not found'; end if;
 if not exists(select 1 from melrah.field_resource r where r.id=a.resource_id and r.user_id=auth.uid()) then raise exception 'appointment not assigned to this collector'; end if;

 select * into w from melrah.work_order where id=a.work_order_id;
 select * into c from melrah.collection_container where (container_code=p_container_code or qr_value=p_container_code) and active=true limit 1;
 select * into s from melrah.collection_station where id=c.station_id;
 if w.id is null or c.id is null or s.id is null then raise exception 'work order/container not found'; end if;
 if coalesce(w.program_key,'CANNABIS_PACKAGING') <> p_program_key then raise exception 'work order program mismatch'; end if;
 if coalesce(c.program_key,'CANNABIS_PACKAGING') <> p_program_key then raise exception 'container program mismatch'; end if;

 insert into melrah.collection_record(
   work_order_id,appointment_id,location_id,station_id,container_id,material_stream,
   weight_lbs,package_count,contamination_pct,fill_level_pct,bag_batch_id,
   before_photo_url,after_photo_url,latitude,longitude,notes,recorded_by,
   program_key,contamination_level,replacement_container_code)
 values(
   w.id,a.id,w.location_id,s.id,c.id,c.material_stream,
   p_weight_lbs,p_package_count,p_contamination_pct,p_fill_level_pct,p_bag_batch_id,
   p_before_photo_path,p_after_photo_path,p_latitude,p_longitude,p_notes,a.resource_id,
   p_program_key,p_contamination_level,p_replacement_container_code)
 returning id into rid;

 select display_name into actor_name from melrah.field_resource where id=a.resource_id;
 insert into melrah.custody_event(work_order_id,event_type,occurred_at,actor,note)
 values(w.id,'COLLECTION_RECORDED',now(),actor_name,
   p_program_key||' · '||c.material_stream||' · '||coalesce(p_weight_lbs,0)||' lb');

 return rid;
end $$;

grant execute on function public.melrah_field_record_collection(uuid,text,numeric,integer,numeric,numeric,text,text,numeric,numeric,text,text,text,text,text) to authenticated;

-- Route Briefcase now returns the program key with each appointment.
drop function if exists public.melrah_field_my_route();
create or replace function public.melrah_field_my_route()
returns table(
 id uuid,work_order_id uuid,resource_id uuid,scheduled_start timestamptz,scheduled_end timestamptz,
 status text,sequence_no integer,route_name text,accepted_at timestamptz,en_route_at timestamptz,
 arrived_at timestamptz,started_at timestamptz,completed_at timestamptz,exception_code text,
 exception_notes text,created_at timestamptz,updated_at timestamptz,program_key text)
language sql security invoker set search_path=public,melrah,core,pg_temp as $$
 select a.id,a.work_order_id,a.resource_id,a.scheduled_start,a.scheduled_end,a.status,a.sequence_no,a.route_name,
 a.accepted_at,a.en_route_at,a.arrived_at,a.started_at,a.completed_at,a.exception_code,a.exception_notes,
 a.created_at,a.updated_at,coalesce(w.program_key,'CANNABIS_PACKAGING')
 from melrah.service_appointment a
 join melrah.field_resource r on r.id=a.resource_id
 join melrah.work_order w on w.id=a.work_order_id
 where r.user_id=auth.uid() and a.status not in ('CANCELLED')
 order by a.scheduled_start nulls last,a.sequence_no nulls last;
$$;
grant execute on function public.melrah_field_my_route() to authenticated;
