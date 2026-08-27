-- 0011 — make every view enforce RLS (security_invoker = true).
-- Applied to production as `views_security_invoker_rls_enforcement`.
--
-- THE BUG
-- A Postgres view runs with its OWNER's privileges by default. These
-- views are owned by `postgres`, which bypasses RLS, so a SELECT through
-- them skipped the row-level policies on their base tables entirely.
--
-- 21 of the 23 affected views were created earlier in this same session
-- (migrations 0004, 0007, 0008, 0010). The pre-existing platform views
-- (core_*, ec_*, original ml_*) all correctly carry
-- security_invoker = true; the new ones did not follow that convention,
-- which silently undid the tenant isolation their policies provide.
--
-- IMPACT BEFORE THE FIX
--   ml_invoice / ml_invoice_line   any authenticated user could read all
--                                  Melrah invoices and amounts, any tenant
--   ml_inventory, ml_inventory_movement, ml_loss_event, ml_rate_card,
--   ml_work_order_visit, ml_facility_capture, ml_hub*,
--   ml_work_order_billing          same cross-tenant exposure of
--                                  operational, cost and mileage data
--   v_lesson_media,
--   v_media_asset_usage            learners could read unpublished media,
--                                  defeating the published-only policy
--
-- Two views predate this session with the identical defect and are fixed
-- here as well: empowercare.credential_verification, melrah.lot_status.
--
-- EFFECT
-- Reads now run as the calling user, so base-table policies apply. A
-- genuine tenant member sees exactly what they saw before; a user who
-- was seeing another tenant's rows stops.
--
-- LESSON: any new view over an RLS-protected table must set
-- security_invoker = true. Enabling RLS on the table is not enough if a
-- view over it runs as a bypassing owner.

do $$
declare v record;
begin
  for v in
    select n.nspname as sch, c.relname as rel
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'v'
      and n.nspname in ('public','melrah','empowercare','core')
      and coalesce((select option_value from pg_options_to_table(c.reloptions)
                    where option_name = 'security_invoker'), 'off') = 'off'
  loop
    execute format('alter view %I.%I set (security_invoker = true)', v.sch, v.rel);
    raise notice 'security_invoker enabled: %.%', v.sch, v.rel;
  end loop;
end $$;

-- Verification (expect 0 / 56 / 56):
--   select count(*) filter (where si='off')  as still_bypassing,
--          count(*) filter (where si='true') as enforcing, count(*)
--   from (select coalesce((select option_value from
--            pg_options_to_table(c.reloptions)
--            where option_name='security_invoker'),'off') as si
--         from pg_class c join pg_namespace n on n.oid=c.relnamespace
--         where c.relkind='v'
--           and n.nspname in ('public','melrah','empowercare','core')) t;
