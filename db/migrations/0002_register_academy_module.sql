-- 0002_register_academy_module.sql
-- ── Register Claude Academy in the MorpheusOS service registry ──
--
-- MORPHEUS.EDU / Claude Academy already ships a working UI at /academy
-- and a live course row (public.edu_courses code 'CAP-C'), but it has
-- never had a core.module row — so a registry-driven service switcher
-- could not show it. This adds the missing registry rows.
--
-- sort_order 15 places it between workforce.cer (10) and
-- workforce.empowercare (20).
--
-- Idempotent: safe to re-run. Inserts only; never updates an existing
-- row, so a later hand-edit of either row survives a re-run.

begin;

insert into core.module (key, name, description, schema_name, category, status, sort_order)
values (
  'workforce.academy',
  'Claude Academy',
  'CTS Certified Claude Practitioner (CAP-C) — course delivery, enrolment and credential issuance',
  'public',
  'workforce',
  'AVAILABLE',
  15
)
on conflict (key) do nothing;

insert into core.tenant_module (tenant_id, module_key, enabled)
select t.id, 'workforce.academy', true
from core.tenant t
where t.slug = 'cts'
on conflict (tenant_id, module_key) do nothing;

commit;
