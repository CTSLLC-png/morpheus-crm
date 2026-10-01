-- MELRAH FIELD v2.3 — dispatch priority and secure evidence URL helper
create or replace function public.melrah_field_evidence_url(p_path text,p_expires integer default 300)
returns text language plpgsql security invoker set search_path=public,storage,core,pg_temp as $$
begin
 if not core.member_of(core.tenant_id('melrah')) then raise exception 'not authorized'; end if;
 if p_path is null or p_path='' then return null; end if;
 return storage.sign_object_url('melrah-field-evidence',p_path,p_expires);
end $$;
grant execute on function public.melrah_field_evidence_url(text,integer) to authenticated;

create or replace view public.ml_dispatch_recommendations with (security_invoker=true) as
select q.*,case when coalesce(q.max_fill_pct,0)>=90 then 100 when coalesce(q.max_fill_pct,0)>=80 then 80 else 40 end
 + case when q.priority='URGENT' then 50 when q.priority='HIGH' then 25 else 0 end as route_score
from melrah.dispatch_queue q;
grant select on public.ml_dispatch_recommendations to authenticated;
