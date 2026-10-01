-- MELRAH FIELD v2.1 — photo evidence metadata and field-safe collection completion
alter table melrah.collection_record add column if not exists before_photo_path text;
alter table melrah.collection_record add column if not exists after_photo_path text;
alter table melrah.collection_record add column if not exists captured_at timestamptz not null default now();

create or replace function public.melrah_field_record_collection(
 p_appointment_id uuid,p_container_code text,p_weight_lbs numeric,p_package_count integer,
 p_contamination_pct numeric,p_fill_level_pct numeric,p_bag_batch_id text,p_notes text default null,
 p_latitude numeric default null,p_longitude numeric default null,p_before_photo_path text default null,p_after_photo_path text default null)
returns uuid language plpgsql security invoker set search_path=public,melrah,core,pg_temp as $$
declare a melrah.service_appointment; w melrah.work_order; c melrah.collection_container; s melrah.collection_station; rid uuid;
begin
 if not core.member_of(core.tenant_id('melrah')) then raise exception 'not authorized'; end if;
 select * into a from melrah.service_appointment where id=p_appointment_id;
 select * into w from melrah.work_order where id=a.work_order_id;
 select * into c from melrah.collection_container where container_code=p_container_code or qr_value=p_container_code limit 1;
 select * into s from melrah.collection_station where id=c.station_id;
 if a.id is null or w.id is null or c.id is null or s.id is null then raise exception 'appointment/container not found'; end if;
 if p_bag_batch_id is null or btrim(p_bag_batch_id)='' then raise exception 'bag/batch id required'; end if;
 insert into melrah.collection_record(work_order_id,appointment_id,location_id,station_id,container_id,material_stream,weight_lbs,package_count,contamination_pct,fill_level_pct,bag_batch_id,latitude,longitude,notes,recorded_by,before_photo_path,after_photo_path)
 values(w.id,a.id,w.location_id,s.id,c.id,c.material_stream,p_weight_lbs,p_package_count,p_contamination_pct,p_fill_level_pct,p_bag_batch_id,p_latitude,p_longitude,p_notes,auth.uid(),p_before_photo_path,p_after_photo_path) returning id into rid;
 return rid;
end $$;
grant execute on function public.melrah_field_record_collection(uuid,text,numeric,integer,numeric,numeric,text,text,numeric,numeric,text,text) to authenticated;
