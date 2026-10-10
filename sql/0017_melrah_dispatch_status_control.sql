-- 0017 — Melrah Operations Control: work order status changes
--
-- Lets dispatch staff move a work order through its lifecycle from the
-- Operations Control screen. Only forward steps (plus cancel) are allowed:
--
--   DRAFT ──► RELEASED ──► IN_TRANSIT ──► RECEIVED ──► CLOSED
--     └──────────┴─────────────┴──────────────┴──────► CANCELLED
--
-- CLOSED and CANCELLED are final. RELEASED needs an assigned collector.
-- Closing still goes through melrah.enforce_wo_close (lot gate).
-- Cancelling also cancels the open service appointment so it leaves the
-- collector's Route Briefcase.

create or replace function public.melrah_dispatch_set_status(
  p_work_order_id uuid,
  p_status        text,
  p_note          text default null
) returns text
language plpgsql
set search_path to 'public', 'melrah', 'core', 'pg_temp'
as $function$
declare
  wo      melrah.work_order%rowtype;
  allowed text[];
begin
  if not core.member_of(core.tenant_id('melrah')) then
    raise exception 'not authorized';
  end if;

  select * into wo from melrah.work_order where id = p_work_order_id for update;
  if not found then
    raise exception 'work order not found';
  end if;

  p_status := upper(trim(p_status));
  if p_status = wo.status then
    return wo.status;
  end if;

  allowed := case wo.status
    when 'DRAFT'      then array['RELEASED','CANCELLED']
    when 'RELEASED'   then array['IN_TRANSIT','CANCELLED']
    when 'IN_TRANSIT' then array['RECEIVED','CANCELLED']
    when 'RECEIVED'   then array['CLOSED','CANCELLED']
    else array[]::text[]
  end;

  if not (p_status = any(allowed)) then
    raise exception 'Work order % is %; it cannot move to %.', wo.wo_number, wo.status, p_status;
  end if;

  if p_status = 'RELEASED' and wo.assigned_resource_id is null then
    raise exception 'Assign a collector before releasing work order %.', wo.wo_number;
  end if;

  update melrah.work_order set
    status         = p_status,
    dispatched_at  = case when p_status = 'RELEASED'   then coalesce(dispatched_at, now()) else dispatched_at end,
    en_route_at    = case when p_status = 'IN_TRANSIT' then coalesce(en_route_at, now())   else en_route_at end,
    completed_at   = case when p_status = 'RECEIVED'   then coalesce(completed_at, now())  else completed_at end,
    cancelled_at   = case when p_status = 'CANCELLED'  then now()                          else cancelled_at end,
    dispatch_notes = case when nullif(trim(p_note), '') is null then dispatch_notes
                          else concat_ws(E'\n', dispatch_notes,
                                 to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI') ||
                                 ' ' || p_status || ': ' || trim(p_note)) end
  where id = p_work_order_id;

  if p_status = 'CANCELLED' then
    update melrah.service_appointment
       set status = 'CANCELLED', updated_at = now()
     where work_order_id = p_work_order_id
       and status not in ('COMPLETED','CANCELLED');
  end if;

  return p_status;
end
$function$;

revoke all on function public.melrah_dispatch_set_status(uuid, text, text) from public, anon;
grant execute on function public.melrah_dispatch_set_status(uuid, text, text) to authenticated;
