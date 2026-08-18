-- =====================================================================
-- Morpheus OS — 0002_tenant_isolation.test.sql
-- pgTAP suite for RLS / multi-tenant isolation.
--
-- SAFETY: the whole file runs inside BEGIN ... ROLLBACK. Nothing is
-- committed, including CREATE EXTENSION pgtap and the temporary
-- core.membership grants the positive-direction tests need.
--
-- METHOD: every isolation assertion runs as the `authenticated` role with
-- an impersonated JWT:
--
--     SELECT set_config('request.jwt.claims',
--            json_build_object('sub','<uuid>','role','authenticated')::text, true);
--     SET LOCAL ROLE authenticated;
--
-- service_role and postgres both bypass RLS, so no isolation assertion may
-- run as either. Tests T1-T3 below assert that we really did drop
-- privileges; if they fail, every result after them is meaningless.
--
-- BOTH DIRECTIONS: for each protected relation we assert that a member
-- sees its rows AND that a non-member sees exactly zero. A suite that only
-- checks the happy direction proves nothing.
--
-- Fixed subjects (all real rows in auth.users):
--   U_CTS   d3d768f6-95c8-4586-9189-a17e74cb8a94  cts OWNER + staff_profiles
--   U_CTS2  653eeb1f-5ece-41d3-aa65-643efeb197f5  cts OWNER + staff_profiles
--   U_OUT   384f0300-cb14-45b9-bbfc-40f8eb7c8615  no membership, no staff row
--   U_GHOST 00000000-0000-0000-0000-0000000000ff  not an auth user at all
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(51);

-- ---------------------------------------------------------------------
-- Fixtures, seeded as the owner before any privilege drop.
-- ---------------------------------------------------------------------

-- The melrah tenant currently has NO members at all (see section Z), so the
-- positive direction of melrah isolation is untestable without granting one.
-- This grant is transaction-local and rolled back.
INSERT INTO core.membership (user_id, tenant_id, role)
VALUES ('d3d768f6-95c8-4586-9189-a17e74cb8a94',
        '1541bcd7-6955-47ca-8aa3-5d27f9d078f1', 'OPERATOR');

INSERT INTO melrah.device (id, sku, description)
VALUES ('b0000000-0000-0000-0000-000000000001','TEST-SKU-ISO','Isolation test device');

-- A row genuinely owned by the melrah tenant ...
INSERT INTO melrah.account (id, tenant_id, name, network_type)
VALUES ('b1000000-0000-0000-0000-000000000001',
        '1541bcd7-6955-47ca-8aa3-5d27f9d078f1','ISO Melrah Account','IDN');

-- ... and a row sitting in a melrah table but stamped with the CTS tenant id.
-- A correctly row-scoped policy would hide this from a melrah member.
INSERT INTO melrah.account (id, tenant_id, name, network_type)
VALUES ('b1000000-0000-0000-0000-0000000000f0',
        '4792dc21-d9fb-4e24-9f44-74e191b9dc78','ISO Foreign Tenant Account','IDN');

INSERT INTO melrah.work_order (id, tenant_id, wo_number, account_id, wo_type)
VALUES ('b2000000-0000-0000-0000-000000000001',
        '1541bcd7-6955-47ca-8aa3-5d27f9d078f1','ISO-WO-1',
        'b1000000-0000-0000-0000-000000000001','COLLECTION');

INSERT INTO melrah.lot (id, tenant_id, lot_number, work_order_id, device_id, qty_received)
VALUES ('b3000000-0000-0000-0000-000000000001',
        '1541bcd7-6955-47ca-8aa3-5d27f9d078f1','ISO-LOT-1',
        'b2000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',10);

INSERT INTO melrah.qc_inspection (id, lot_id, sample_size, defects_found, disposition)
VALUES ('b4000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001',10,0,'ACCEPT');

INSERT INTO melrah.custody_event (id, work_order_id, event_type, actor)
VALUES (910000001,'b2000000-0000-0000-0000-000000000001','SEALED','iso-test');

-- empowercare fixture: a participant bound to U_OUT, who is NOT staff.
-- This is what exercises the participant-scoped own_enrollment policy.
INSERT INTO public.participants (id, cts_id, full_name, program_source, user_id)
VALUES ('b5000000-0000-0000-0000-000000000001','','ISO Participant Self',
        'Direct Enrollment','384f0300-cb14-45b9-bbfc-40f8eb7c8615');
INSERT INTO public.participants (id, cts_id, full_name, program_source)
VALUES ('b5000000-0000-0000-0000-000000000002','','ISO Participant Other','Direct Enrollment');

INSERT INTO empowercare.enrollment (id, participant_id) VALUES
  ('b6000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001'),
  ('b6000000-0000-0000-0000-000000000002','b5000000-0000-0000-0000-000000000002');


-- =====================================================================
-- T. Preconditions — prove we actually dropped privileges.
-- =====================================================================

RESET ROLE;
SELECT set_config('request.jwt.claims',
       json_build_object('sub','d3d768f6-95c8-4586-9189-a17e74cb8a94','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- 1
SELECT is(current_user::text, 'authenticated',
  'T1: isolation assertions run as the authenticated role');
-- 2
SELECT is((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false,
  'T2: the impersonated role does NOT have BYPASSRLS');
-- 3
SELECT isnt(current_user::text, 'service_role',
  'T3: the suite is not running as service_role (which bypasses RLS)');
-- 4
SELECT is(auth.uid(), 'd3d768f6-95c8-4586-9189-a17e74cb8a94'::uuid,
  'T4: the impersonated JWT sub is what auth.uid() resolves to');

RESET ROLE;

-- 5. every relation in the kernel and both module schemas has RLS enabled
SELECT is(
  (SELECT count(*) FROM pg_class c
    WHERE c.relkind='r'
      AND c.relnamespace::regnamespace::text IN ('core','empowercare','melrah')
      AND NOT c.relrowsecurity),
  0::bigint,
  'T5: RLS is enabled on every table in core, empowercare and melrah'
);


-- =====================================================================
-- C. core kernel — a CTS owner
-- =====================================================================

RESET ROLE;
SELECT set_config('request.jwt.claims',
       json_build_object('sub','d3d768f6-95c8-4586-9189-a17e74cb8a94','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- 6. POSITIVE: the member sees the tenant it belongs to
SELECT is(
  (SELECT count(*) FROM core.tenant WHERE slug='cts'),
  1::bigint,
  'C1: a CTS owner sees the cts tenant row'
);

-- 7. NEGATIVE: and not the tenant it does not belong to
SELECT is(
  (SELECT count(*) FROM core.tenant WHERE slug='parentplug'),
  0::bigint,
  'C2: a CTS owner cannot see the parentplug tenant'
);

-- 8. this user was granted melrah above, so it now sees exactly two tenants
SELECT is(
  (SELECT count(*) FROM core.tenant),
  2::bigint,
  'C3: the user sees exactly the two tenants it is a member of (cts + granted melrah)'
);

-- 9. membership rows are self-scoped
SELECT is(
  (SELECT count(*) FROM core.membership WHERE user_id <> auth.uid()),
  0::bigint,
  'C4: a user cannot see another user''s core.membership rows'
);

-- 10. POSITIVE: it does see its own
SELECT cmp_ok(
  (SELECT count(*) FROM core.membership WHERE user_id = auth.uid()), '>=', 1::bigint,
  'C5: a user does see its own core.membership rows'
);

-- 11. tenant_module is scoped by membership
SELECT is(
  (SELECT count(*) FROM core.tenant_module tm
    WHERE tm.tenant_id = '2c1f93ff-8507-4ddc-82a6-57c5a8a3db11'),
  0::bigint,
  'C6: a non-member cannot see parentplug tenant_module rows'
);

-- 12. POSITIVE
SELECT cmp_ok(
  (SELECT count(*) FROM core.tenant_module tm
    WHERE tm.tenant_id = '4792dc21-d9fb-4e24-9f44-74e191b9dc78'), '>=', 1::bigint,
  'C7: a CTS owner does see cts tenant_module rows'
);

-- 13. core.module is deliberately world-readable to authenticated (catalogue,
--     no tenant data). Documented here so a future tightening is a visible change.
SELECT cmp_ok(
  (SELECT count(*) FROM core.module), '>=', 1::bigint,
  'C8: core.module is readable by any authenticated user (catalogue by design)'
);

-- 14/15. morpheus_bootstrap is SECURITY INVOKER, so it must inherit RLS
SELECT is(
  (SELECT jsonb_array_length(public.morpheus_bootstrap()->'tenants')),
  2,
  'C9: morpheus_bootstrap returns exactly the caller''s tenants'
);
SELECT is(
  (SELECT public.morpheus_bootstrap()->>'user_id'),
  'd3d768f6-95c8-4586-9189-a17e74cb8a94',
  'C10: morpheus_bootstrap reports the calling user'
);

-- 16. and it does not leak a tenant the caller is not in
SELECT is(
  (SELECT count(*) FROM jsonb_array_elements(public.morpheus_bootstrap()->'tenants') t
    WHERE t->>'slug' = 'parentplug'),
  0::bigint,
  'C11: morpheus_bootstrap does not leak the parentplug tenant'
);


-- =====================================================================
-- N. core kernel — an outsider (real auth user, zero memberships)
-- =====================================================================

RESET ROLE;
SELECT set_config('request.jwt.claims',
       json_build_object('sub','384f0300-cb14-45b9-bbfc-40f8eb7c8615','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- 17
SELECT is((SELECT count(*) FROM core.tenant), 0::bigint,
  'N1: a user with no membership sees zero tenants');
-- 18
SELECT is((SELECT count(*) FROM core.membership), 0::bigint,
  'N2: a user with no membership sees zero membership rows');
-- 19
SELECT is((SELECT count(*) FROM core.tenant_module), 0::bigint,
  'N3: a user with no membership sees zero tenant_module rows');
-- 20
SELECT is((SELECT jsonb_array_length(public.morpheus_bootstrap()->'tenants')), 0,
  'N4: morpheus_bootstrap returns no tenants for a non-member');
-- 21
SELECT is(core.member_of('4792dc21-d9fb-4e24-9f44-74e191b9dc78'), false,
  'N5: core.member_of() is false for a non-member');
-- 22
SELECT is(core.has_role('4792dc21-d9fb-4e24-9f44-74e191b9dc78', ARRAY['OWNER']), false,
  'N6: core.has_role() is false for a non-member');

-- 23. a JWT for a subject that is not even an auth user
RESET ROLE;
SELECT set_config('request.jwt.claims',
       json_build_object('sub','00000000-0000-0000-0000-0000000000ff','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM core.tenant), 0::bigint,
  'N7: a forged JWT sub that is not an auth user sees zero tenants');
-- 24
SELECT is((SELECT jsonb_array_length(public.morpheus_bootstrap()->'tenants')), 0,
  'N8: morpheus_bootstrap returns no tenants for a forged JWT sub');


-- =====================================================================
-- M. melrah module — member vs non-member
-- =====================================================================

-- POSITIVE: U_CTS was granted melrah OPERATOR in the fixtures.
RESET ROLE;
SELECT set_config('request.jwt.claims',
       json_build_object('sub','d3d768f6-95c8-4586-9189-a17e74cb8a94','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- 25
SELECT is(core.member_of(core.tenant_id('melrah')), true,
  'M1: the granted user is a member of the melrah tenant');
-- 26
SELECT is((SELECT count(*) FROM melrah.account WHERE id='b1000000-0000-0000-0000-000000000001'),
  1::bigint, 'M2: a melrah member sees the melrah-owned account');
-- 27
SELECT is((SELECT count(*) FROM melrah.work_order WHERE id='b2000000-0000-0000-0000-000000000001'),
  1::bigint, 'M3: a melrah member sees the melrah work order');
-- 28
SELECT is((SELECT count(*) FROM melrah.lot WHERE id='b3000000-0000-0000-0000-000000000001'),
  1::bigint, 'M4: a melrah member sees the melrah lot');
-- 29
SELECT is((SELECT count(*) FROM melrah.qc_inspection WHERE id='b4000000-0000-0000-0000-000000000001'),
  1::bigint, 'M5: a melrah member sees the QC inspection');
-- 30
SELECT is((SELECT count(*) FROM melrah.custody_event WHERE id=910000001),
  1::bigint, 'M6: a melrah member sees the custody event');
-- 31
SELECT cmp_ok((SELECT count(*) FROM melrah.onboarding_step), '>=', 1::bigint,
  'M7: a melrah member can read the onboarding step catalogue');
-- 32. a member may write
SELECT lives_ok(
  $$ INSERT INTO melrah.account (id, name, network_type)
     VALUES ('b1000000-0000-0000-0000-000000000002','ISO Member Insert','ASC') $$,
  'M8: a melrah member may INSERT into melrah.account'
);

-- NEGATIVE: U_CTS2 is a CTS owner and staff, but NOT a melrah member.
RESET ROLE;
SELECT set_config('request.jwt.claims',
       json_build_object('sub','653eeb1f-5ece-41d3-aa65-643efeb197f5','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- 33
SELECT is(core.member_of(core.tenant_id('melrah')), false,
  'M9: a cts-only user is not a member of the melrah tenant');
-- 34
SELECT is((SELECT count(*) FROM melrah.account), 0::bigint,
  'M10: a non-member of melrah sees ZERO melrah accounts');
-- 35
SELECT is((SELECT count(*) FROM melrah.work_order), 0::bigint,
  'M11: a non-member of melrah sees ZERO work orders');
-- 36
SELECT is((SELECT count(*) FROM melrah.lot), 0::bigint,
  'M12: a non-member of melrah sees ZERO lots');
-- 37
SELECT is((SELECT count(*) FROM melrah.qc_inspection), 0::bigint,
  'M13: a non-member of melrah sees ZERO QC inspections');
-- 38
SELECT is((SELECT count(*) FROM melrah.custody_event), 0::bigint,
  'M14: a non-member of melrah sees ZERO custody events');
-- 39. and may not write
SELECT throws_ok(
  $$ INSERT INTO melrah.account (id, name, network_type)
     VALUES ('b1000000-0000-0000-0000-0000000000e1','ISO Denied Insert','ASC') $$,
  '42501',
  NULL,
  'M15: a non-member of melrah is refused INSERT by the RLS WITH CHECK'
);


-- =====================================================================
-- E. empowercare module — staff vs participant vs outsider
-- =====================================================================

-- POSITIVE: staff
RESET ROLE;
SELECT set_config('request.jwt.claims',
       json_build_object('sub','d3d768f6-95c8-4586-9189-a17e74cb8a94','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- 40
SELECT is(empowercare.is_staff(), true, 'E1: the subject is recognised as staff');
-- 41
SELECT cmp_ok((SELECT count(*) FROM empowercare.enrollment), '>=', 2::bigint,
  'E2: staff see enrollment rows');

-- PARTICIPANT: U_OUT is bound to participant b5..01 and is NOT staff.
RESET ROLE;
SELECT set_config('request.jwt.claims',
       json_build_object('sub','384f0300-cb14-45b9-bbfc-40f8eb7c8615','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- 42
SELECT is(empowercare.is_staff(), false, 'E3: the participant is not staff');
-- 43. POSITIVE: sees own enrollment
SELECT is((SELECT count(*) FROM empowercare.enrollment WHERE id='b6000000-0000-0000-0000-000000000001'),
  1::bigint, 'E4: a participant sees their own enrollment');
-- 44. NEGATIVE: and nobody else's
SELECT is((SELECT count(*) FROM empowercare.enrollment WHERE id='b6000000-0000-0000-0000-000000000002'),
  0::bigint, 'E5: a participant cannot see another participant''s enrollment');
-- 45. NEGATIVE: no access to staff-only relations
SELECT is((SELECT count(*) FROM empowercare.attempt), 0::bigint,
  'E6: a non-staff user sees ZERO attempts');
-- 46
SELECT is((SELECT count(*) FROM empowercare.audit), 0::bigint,
  'E7: a non-staff user sees ZERO audit rows');


RESET ROLE;

-- =====================================================================
-- Z. KNOWN-FAILING — isolation properties the schema does NOT provide.
-- Stated as they SHOULD hold; wrapped in todo_start/todo_end. See README.
-- =====================================================================

SELECT todo_start('known tenant-isolation gaps — see README "Unenforced invariants"');

-- Z1. The melrah tenant has no members in core.membership. Every melrah RLS
--     policy is core.member_of(core.tenant_id('melrah')), so with zero members
--     the whole module is unreachable for every authenticated user, even
--     though core.tenant_module enables three melrah modules.
--     Measured against the real table, ignoring this suite's own grant.
SELECT cmp_ok(
  (SELECT count(*) FROM core.membership
    WHERE tenant_id='1541bcd7-6955-47ca-8aa3-5d27f9d078f1'
      AND user_id <> 'd3d768f6-95c8-4586-9189-a17e74cb8a94'),
  '>=', 1::bigint,
  'Z1: the melrah tenant must have at least one member, or the module is dead'
);

-- Z2. melrah policies are tenant-CONSTANT, not row-scoped: the qual never
--     references the row's tenant_id. A melrah member therefore sees rows in
--     melrah tables that are stamped with another tenant's id.
RESET ROLE;
SELECT set_config('request.jwt.claims',
       json_build_object('sub','d3d768f6-95c8-4586-9189-a17e74cb8a94','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM melrah.account WHERE id='b1000000-0000-0000-0000-0000000000f0'),
  0::bigint,
  'Z2: a melrah member must NOT see a melrah row stamped with the cts tenant_id'
);

-- Z3. The same hole on the write side: WITH CHECK does not pin tenant_id, so a
--     melrah member can plant a row belonging to another tenant.
SELECT throws_ok(
  $$ INSERT INTO melrah.account (id, tenant_id, name, network_type)
     VALUES ('b1000000-0000-0000-0000-0000000000f3',
             '4792dc21-d9fb-4e24-9f44-74e191b9dc78','ISO Cross Tenant Write','ASC') $$,
  '42501', NULL,
  'Z3: a melrah member must not be able to INSERT a row stamped with another tenant_id'
);
RESET ROLE;

-- Z4. empowercare RLS is not tenant-scoped at all. Every policy keys off
--     public.staff_profiles, never core.membership, and no empowercare table
--     carries a tenant_id column. Strip a staff user of every tenant
--     membership and they still read all clinical records.
DELETE FROM core.membership WHERE user_id='d3d768f6-95c8-4586-9189-a17e74cb8a94';
SELECT set_config('request.jwt.claims',
       json_build_object('sub','d3d768f6-95c8-4586-9189-a17e74cb8a94','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM empowercare.enrollment),
  0::bigint,
  'Z4: a staff user with no tenant membership must not read empowercare enrollments'
);
-- Z5. ... including the audit log.
SELECT is(
  (SELECT count(*) FROM empowercare.audit),
  0::bigint,
  'Z5: a staff user with no tenant membership must not read the empowercare audit log'
);
RESET ROLE;

SELECT todo_end();


SELECT * FROM finish();

ROLLBACK;
