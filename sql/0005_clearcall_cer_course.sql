-- =====================================================================
-- 0005_clearcall_cer_course.sql
-- ClearCall CER — course shell in the existing LMS engine
--
-- Project: ymavrmekxiwdphdyteau
-- REVIEW BEFORE APPLYING. Data-only (no DDL). No DROP, no UPDATE of
-- anything that already exists.
--
-- ---------------------------------------------------------------------
-- WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
-- ---------------------------------------------------------------------
-- CER has a working AI call simulator and a scoring rubric, but no course
-- content whatsoever — no edu_courses row, no modules, no lessons. This
-- migration creates the COURSE SHELL only, so that content can be authored
-- against a real course id instead of a placeholder.
--
-- It creates:
--   * one public.edu_courses row  — CLEARCALL-CSR
--   * four public.edu_modules rows — the four modules named in the company's
--     own ClearCall one-pager, in the order that document gives them.
--
-- It creates NO lessons and NO checkpoint questions. None exist yet. The
-- curriculum has not been written and MUST NOT be invented here: a seeded
-- lesson would be indistinguishable from real content the moment it lands in
-- the database, and this course leads to a credential issued to
-- justice-involved participants. Empty is honest; fabricated is not.
--
-- Consequences of that, all intentional:
--   * is_published = FALSE. The RLS policy "Authenticated can read published
--     courses" therefore hides it from participants entirely until a human
--     publishes it. Staff (super_admin/trainer) can see it now.
--   * every edu_modules row is status = 'outline', not 'available'. A module
--     with zero lessons that claimed to be 'available' would render as a
--     broken empty screen.
--   * duration_minutes is NULL on every module. The one-pager gives 80 hours
--     for the PROGRAMME; it does not apportion them across the four modules,
--     so no split is recorded. Do not guess one.
--   * subtitle / summary / description on the modules are NULL for the same
--     reason.
--
-- Facts below are taken verbatim from the ClearCall one-pager (4 weeks,
-- 80 contact hours, Mon-Fri, 15-participant minimum, on-site or remote,
-- audience: justice-involved individuals preparing for reentry) and from the
-- stated credential name and issuer. Nothing else was added.
--
-- NOT DONE HERE, on purpose:
--   * No link is created between this course and core.module 'workforce.cer'.
--     public.edu_courses has no module_key column, and the existing CAP-C
--     course has no such link either. Adding one is a schema change with no
--     consumer today.
--   * Module 4 ("Job Readiness & Mock Calls") is where the existing AI call
--     simulator belongs. That wiring is application work against
--     src/pages/CallSimulator.jsx, which this branch must not touch. No
--     simulator row, scenario or scoring configuration is written here.
--
-- Idempotent: safe to run twice.
-- Rollback: see sql/MIGRATIONS.md (§0005).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. The course.
--    credential_prefix 'CTS' is the table default and is what
--    src/lib/educert.js already renders; issuer_org 'CTS LLC' likewise.
-- ---------------------------------------------------------------------
INSERT INTO public.edu_courses
  (code, title, subtitle, description,
   credential_name, credential_prefix, hours, issuer_org, is_published)
VALUES (
  'CLEARCALL-CSR',
  'ClearCall Call Center Customer Service Certification',
  NULL,
  '4 weeks, 80 contact hours, Monday to Friday. Minimum 15 participants. '
  'Delivered on-site at partner facilities or remotely. Audience: '
  'justice-involved individuals preparing for reentry.',
  'ClearCall Call Center Customer Service Certification',
  'CTS',
  80,
  'CTS LLC',
  FALSE          -- stays unpublished until real content exists
)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. The four modules, in the one-pager's order.
--    edu_modules has UNIQUE (course_id, sort_order), so ON CONFLICT makes
--    this re-runnable without duplicating or overwriting.
-- ---------------------------------------------------------------------
INSERT INTO public.edu_modules
  (course_id, sort_order, title, subtitle, duration_minutes, status, summary)
SELECT c.id, v.sort_order, v.title, NULL, NULL, 'outline', NULL
FROM (VALUES
  (1, 'Communication Fundamentals'),
  (2, 'Customer Service Excellence'),
  (3, 'Tools & Compliance'),
  (4, 'Job Readiness & Mock Calls')
) AS v(sort_order, title)
CROSS JOIN public.edu_courses c
WHERE c.code = 'CLEARCALL-CSR'
ON CONFLICT (course_id, sort_order) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Guard: fail loudly rather than commit a half-built course.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  n_modules integer;
BEGIN
  SELECT count(*) INTO n_modules
    FROM public.edu_modules m
    JOIN public.edu_courses c ON c.id = m.course_id
   WHERE c.code = 'CLEARCALL-CSR';

  IF n_modules <> 4 THEN
    RAISE EXCEPTION
      'CLEARCALL-CSR should have exactly 4 modules, found %', n_modules;
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- VERIFICATION (read-only) — uncomment after applying.
-- =====================================================================
-- SELECT code, title, hours, credential_name, credential_prefix,
--        issuer_org, is_published
--   FROM public.edu_courses WHERE code = 'CLEARCALL-CSR';
--
-- SELECT m.sort_order, m.title, m.status, m.duration_minutes,
--        (SELECT count(*) FROM public.edu_lessons l WHERE l.module_id = m.id) AS lessons
--   FROM public.edu_modules m
--   JOIN public.edu_courses c ON c.id = m.course_id
--  WHERE c.code = 'CLEARCALL-CSR'
--  ORDER BY m.sort_order;
--   expect: 4 rows, status 'outline', lessons = 0 on every row.
