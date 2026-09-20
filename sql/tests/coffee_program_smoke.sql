-- Coffee program E2E smoke test (transaction rolls back)
begin;
do $$
begin
 if not exists(select 1 from information_schema.columns where table_schema='melrah' and table_name='work_order' and column_name='program_key') then
   raise exception 'program_key migration missing';
 end if;
 if not exists(select 1 from information_schema.columns where table_schema='melrah' and table_name='collection_record' and column_name='contamination_level') then
   raise exception 'coffee collection fields missing';
 end if;
 if not exists(select 1 from pg_proc where proname='melrah_field_record_collection') then
   raise exception 'collection RPC missing';
 end if;
 if not exists(select 1 from pg_proc where proname='melrah_field_my_route') then
   raise exception 'Route Briefcase RPC missing';
 end if;
end $$;
rollback;
