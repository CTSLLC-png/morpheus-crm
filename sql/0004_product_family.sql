-- =====================================================================
-- 0004_product_family.sql
-- Morpheus OS — brand grouping ("product family") for the module catalogue
--
-- Project: ymavrmekxiwdphdyteau
-- REVIEW BEFORE APPLYING. Additive DDL + a small data seed. No DROP.
--
-- ---------------------------------------------------------------------
-- WHY THIS DESIGN (and what was rejected)
-- ---------------------------------------------------------------------
-- The requirement is presentational: CER and EmpowerCare must read as one
-- brand — ClearCall — while Claude Academy stays a plain CTS module. All
-- three already belong to the SAME tenant (`cts`) and must keep belonging to
-- it: no data moves, no re-parenting, no second tenant.
--
-- Rejected: a new `clearcall` tenant. That would fork core.membership, force
-- every participant, cohort, call_session and empowercare.enrollment to pick a
-- side, and break `empowercare.is_staff()` (which hardcodes
-- core.tenant_id('cts')). Enormous blast radius for a label.
--
-- Rejected: a module-hierarchy table (module.parent_key). Grouping is not
-- containment — ClearCall is not a module and has no schema, no routes and no
-- RLS surface. Modelling it as one invites code to try to render it.
--
-- Chosen: the least invasive shape that still lives in the kernel, so the
-- grouping is data rather than a hardcoded list in the React bundle:
--
--   * core.product_family — key, name, description, sort_order. A tiny
--     reference table, peer to core.module, with no tenant column: a family is
--     a brand, not an entitlement. What a tenant HAS is still decided solely
--     by core.tenant_module, which this migration does not touch. The
--     navigation contract is unchanged.
--
--   * core.module.family — nullable FK to that table. NULL means "no brand
--     grouping", which is exactly Claude Academy and every melrah/parentplug
--     module. Nullable is what keeps this additive: no existing row has to
--     change, and nothing breaks if the column is ignored.
--
-- Consequence worth stating: because `family` is only a label on the module
-- row, granting ClearCall to a tenant is still three independent
-- core.tenant_module rows. There is deliberately no way to "enable ClearCall"
-- as a unit. That is correct — a tenant can legitimately buy CER without
-- EmpowerCare, and the compliance surface of EmpowerCare must never ride in on
-- a brand grouping.
--
-- Idempotent: safe to run twice.
-- Rollback: see sql/MIGRATIONS.md (§0004).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. core.product_family
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.product_family (
  key         text        PRIMARY KEY,
  name        text        NOT NULL,
  description text,
  sort_order  smallint    NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_family_key_shape CHECK (key ~ '^[a-z][a-z0-9_]{1,30}$')
);

COMMENT ON TABLE core.product_family IS
  'Brand groupings for the module catalogue. Presentational only: a family '
  'groups modules under one name in navigation and on credentials. It grants '
  'nothing — entitlement remains core.tenant_module, one row per module.';
COMMENT ON COLUMN core.product_family.sort_order IS
  'Order of the family''s section in navigation. Ordering WITHIN a family '
  'stays a client concern (src/modules/registry.jsx nav item `order`).';

ALTER TABLE core.product_family ENABLE ROW LEVEL SECURITY;

-- Mirrors core.module's `read_modules` policy: the catalogue of what Morpheus
-- offers is not secret, and a family row carries no customer data. There is
-- deliberately no INSERT/UPDATE/DELETE policy — the catalogue is edited by
-- migration, as `core.module` already is.
DROP POLICY IF EXISTS read_product_family ON core.product_family;
CREATE POLICY read_product_family
  ON core.product_family
  FOR SELECT
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------
-- 2. core.module.family
-- ---------------------------------------------------------------------
ALTER TABLE core.module ADD COLUMN IF NOT EXISTS family text;

COMMENT ON COLUMN core.module.family IS
  'Optional brand grouping (core.product_family.key). NULL = the module '
  'presents standalone under the tenant''s own name. Label only; it confers '
  'no access and does not affect core.tenant_module.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'module_family_fkey'
       AND conrelid = 'core.module'::regclass
  ) THEN
    ALTER TABLE core.module
      ADD CONSTRAINT module_family_fkey
      FOREIGN KEY (family) REFERENCES core.product_family(key)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Seed: ClearCall
--    The one family that exists today. Named from the company one-pager:
--    CER (the course + AI call simulator) and EmpowerCare (the day-based
--    compliance programme) are sold and delivered as ClearCall.
-- ---------------------------------------------------------------------
INSERT INTO core.product_family (key, name, description, sort_order)
VALUES (
  'clearcall',
  'ClearCall',
  'Call centre customer-service training and certification delivered by '
  'Certified Training Standards LLC. Groups CER Certification and '
  'EmpowerCare. A brand, not a tenant — both modules stay inside the `cts` '
  'tenant.',
  10
)
ON CONFLICT (key) DO NOTHING;

-- Attach the two modules. Guarded so a re-run is a no-op and so a hand edit
-- made in the dashboard afterwards is not silently reverted.
UPDATE core.module
   SET family = 'clearcall'
 WHERE key IN ('workforce.cer', 'workforce.empowercare')
   AND family IS DISTINCT FROM 'clearcall';

-- workforce.academy is deliberately left family = NULL. Claude Academy /
-- CAP-C is a CTS product, not a ClearCall one, and must present outside the
-- group. Do not "tidy" this by giving it a family.

-- ---------------------------------------------------------------------
-- 4. Bridge views — the Data API exposes only `public`, so core is reached
--    through public.core_* views. Both are security_invoker so core RLS
--    still decides every row (see the 2026-08-27 views_security_invoker
--    incident: 23 views were running as definer and bypassing RLS).
-- ---------------------------------------------------------------------

-- CREATE OR REPLACE can only APPEND columns to an existing view, so `family`
-- goes last. Column order is unchanged for every existing consumer.
CREATE OR REPLACE VIEW public.core_module
WITH (security_invoker = true) AS
  SELECT key,
         name,
         description,
         schema_name,
         category,
         status,
         sort_order,
         family
    FROM core.module;

CREATE OR REPLACE VIEW public.core_product_family
WITH (security_invoker = true) AS
  SELECT key,
         name,
         description,
         sort_order
    FROM core.product_family;

GRANT SELECT ON public.core_module          TO authenticated;
GRANT SELECT ON public.core_product_family  TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Bootstrap RPCs — carry `family` through to the shell.
--    Both are CREATE OR REPLACE of an existing function; the only change is
--    one extra key in the emitted JSON. Existing clients ignore it.
--    The previous bodies are reproduced verbatim in MIGRATIONS.md for
--    rollback.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.morpheus_bootstrap()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'core', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'families', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', f.key, 'name', f.name,
        'description', f.description, 'sort_order', f.sort_order
      ) order by f.sort_order, f.key)
      from core.product_family f
    ), '[]'::jsonb),
    'tenants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',           t.id,
        'slug',         t.slug,
        'name',         t.name,
        'legal_entity', t.legal_entity,
        'industry',     t.industry,
        'status',       t.status,
        'role',         m.role,
        'modules', coalesce((
          select jsonb_agg(jsonb_build_object(
            'key',         mo.key,
            'name',        mo.name,
            'description', mo.description,
            'schema',      mo.schema_name,
            'category',    mo.category,
            'status',      mo.status,
            'sort_order',  mo.sort_order,
            'family',      mo.family,
            'enabled',     tm.enabled,
            'config',      tm.config
          ) order by mo.sort_order)
          from core.tenant_module tm
          join core.module mo on mo.key = tm.module_key
          where tm.tenant_id = t.id
        ), '[]'::jsonb)
      ) order by t.name)
      from core.tenant t
      join core.membership m on m.tenant_id = t.id and m.user_id = auth.uid()
    ), '[]'::jsonb)
  )
$function$;

CREATE OR REPLACE FUNCTION public.morpheus_participant_bootstrap()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'core', 'pg_temp'
AS $function$
  with me as (
    select public.current_participant_id() as pid
  ),
  assigned as (
    select pm.module_key
    from public.participant_modules pm, me
    where pm.participant_id = me.pid and pm.enabled
  )
  select jsonb_build_object(
    'participant_id', (select pid from me),
    'assignment_mode', case when exists (select 1 from assigned) then 'assigned' else 'all' end,
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', m.key, 'name', m.name, 'description', m.description,
        'category', m.category, 'sort_order', m.sort_order,
        'family', m.family
      ) order by m.sort_order)
      from core.module m
      where m.status = 'AVAILABLE'
        and (
          exists (select 1 from assigned a where a.module_key = m.key)
          or not exists (select 1 from assigned)
        )
    ), '[]'::jsonb)
  )
$function$;

COMMIT;

-- =====================================================================
-- VERIFICATION (read-only) — uncomment after applying.
-- =====================================================================
-- SELECT key, name, family FROM core.module ORDER BY sort_order;
--   expect: workforce.cer -> clearcall, workforce.empowercare -> clearcall,
--           workforce.academy -> NULL, everything else NULL.
-- SELECT * FROM core.product_family;
-- SELECT relname, reloptions FROM pg_class
--  WHERE relname IN ('core_module','core_product_family');
--   expect: {security_invoker=true} on both.
