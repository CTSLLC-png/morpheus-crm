-- MELRAH FIELD v2.2 — private evidence storage, collector scoping, custody automation
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('melrah-field-evidence','melrah-field-evidence',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists melrah_evidence_member_read on storage.objects;
create policy melrah_evidence_member_read on storage.objects for select to authenticated
using(bucket_id='melrah-field-evidence' and core.member_of(core.tenant_id('melrah')));
drop policy if exists melrah_evidence_member_insert on storage.objects;
create policy melrah_evidence_member_insert on storage.objects for insert to authenticated
with check(bucket_id='melrah-field-evidence' and core.member_of(core.tenant_id('melrah')) and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.melrah_field_my_route()
returns setof melrah.service_appointment language sql security invoker set search_path=public,melrah,core,pg_temp as $$
 select a.* from melrah.service_appointment a join melrah.field_resource r on r.id=a.resource_id
 where r.user_id=auth.uid() and a.status not in ('CANCELLED') order by a.scheduled_start nulls last,a.sequence_no nulls last;
$$;
grant execute on function public.melrah_field_my_route() to authenticated;

create or replace function public.melrah_field_transition(p_appointment_id uuid,p_status text)
returns jsonb language plpgsql security invoker set search_path=public,melrah,core,pg_temp as $$
declare a melrah.service_appointment; ts timestamptz:=now(); wo uuid; actor_name text;
begin
 if not core.member_of(core.tenant_id('melrah')) then raise exception 'not authorized'; end if;
 if p_status not in ('ACCEPTED','EN_ROUTE','ARRIVED','IN_PROGRESS','COMPLETED','EXCEPTION') then raise exception 'invalid status'; end if;
 if not exists(select 1 from melrah.service_appointment x join melrah.field_resource r on r.id=x.resource_id where x.id=p_appointment_id and r.user_id=auth.uid()) then raise exception 'appointment not assigned to this collector'; end if;
 update melrah.service_appointment set status=p_status,accepted_at=case when p_status='ACCEPTED' then ts else accepted_at end,en_route_at=case when p_status='EN_ROUTE' then ts else en_route_at end,arrived_at=case when p_status='ARRIVED' then ts else arrived_at end,started_at=case when p_status='IN_PROGRESS' then ts else started_at end,completed_at=case when p_status='COMPLETED' then ts else completed_at end,updated_at=ts where id=p_appointment_id returning * into a;
 select display_name into actor_name from melrah.field_resource where id=a.resource_id; wo:=a.work_order_id;
 insert into melrah.custody_event(work_order_id,event_type,occurred_at,actor,note) values(wo,'FIELD_'||p_status,ts,actor_name,'MELRAH FIELD mobile event');
 return jsonb_build_object('id',a.id,'status',a.status,'updated_at',a.updated_at);
end $$;
grant execute on function public.melrah_field_transition(uuid,text) to authenticated;
