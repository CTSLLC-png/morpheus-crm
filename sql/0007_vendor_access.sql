-- =====================================================================
-- 0007_vendor_access.sql
-- Vendor / funder accounts — view-only, scoped by cohort membership
--
-- Project: ymavrmekxiwdphdyteau
-- REVIEW BEFORE APPLYING. Additive DDL and additive PERMISSIVE policies
-- only. No existing table, column, policy or function is altered or
-- dropped. Every policy added here is FOR SELECT.
--
-- ---------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------
-- A vendor (a facility, funder or referring agency that paid for a cohort)
-- needs to see how their people are doing, and nothing else. The scope unit
-- is the COHORT: a vendor is granted one or more cohorts and sees exactly the
-- participants enrolled in them.
--
-- ---------------------------------------------------------------------
-- THE ROLE
-- ---------------------------------------------------------------------
-- public.current_user_role() reads auth.users.raw_app_meta_data->>'role'.
-- 'vendor' becomes a fourth value there, alongside super_admin / trainer /
-- participant, and the application uses it to route to the vendor UI.
--
-- But the role claim is NOT the authority for access. Every policy below
-- keys off public.current_vendor_id(), which requires an explicit row in
-- public.vendor_user joined to an ACTIVE vendor. Stamping role='vendor' on a
-- user grants nothing on its own; deleting their vendor_user row revokes
-- everything immediately without touching auth. Two independent facts must
-- agree, and the database only ever trusts the one it owns.
--
--   >>> See sql/MIGRATIONS.md — the supabase/functions/on-user-signup edge
--   >>> function writes the role to user_metadata, which
--   >>> current_user_role() does NOT read. That is a pre-existing bug, it is
--   >>> not fixed here, and vendor users must have role set in APP metadata
--   >>> (auth.admin.updateUserById with app_metadata) until it is.
--
-- ---------------------------------------------------------------------
-- DATA MINIMISATION — the part to get right
-- ---------------------------------------------------------------------
-- A vendor may see: participant name and status, ClearCall/Academy progress,
-- completion, and EmpowerCare attendance.
--
-- For EmpowerCare specifically a vendor may see ATTENDANCE and COMPLETION
-- STATUS ONLY — never assessment scores, never attempts, never gate results.
-- Concretely, NO vendor policy is created on any of:
--   empowercare.attempt, empowercare.amendment, empowercare.remediation,
--   empowercare.exam_form, empowercare.audit, empowercare.assessment,
--   empowercare.artifact, empowercare.artifact_exercise,
--   empowercare.enrollment, empowercare.credential,
--   public.edu_checkpoint_attempts, public.edu_checkpoint_questions,
--   public.call_sessions, public.call_scores, public.certifications,
--   public.score_matrix_weights.
-- Do not add one later without re-reading this block.
--
-- empowercare.enrollment.state is on that list for a non-obvious reason: the
-- enum includes WEEK_TWO_BLOCKED, which IS the result of the hard day-3
-- 'Caller authentication' gate. Handing a vendor the raw state tells them a
-- participant failed a specific compliance gate. Vendors get a coarse
-- IN_PROGRESS / COMPLETED / EXITED mapping instead, computed inside
-- public.vendor_empowercare_status() below.
--
-- ---------------------------------------------------------------------
-- WHY SOME ACCESS IS A FUNCTION AND NOT A POLICY
-- ---------------------------------------------------------------------
-- RLS filters ROWS, not COLUMNS. public.participants carries dob,
-- ldss_office, ldss_case_number, ldss_caseworker and notes. A row-level
-- vendor policy on that table would hand a vendor a participant's benefits
-- case number the moment they queried the table directly through PostgREST —
-- whatever the UI chose to display. The same is true of
-- empowercare.enrollment (retain_until, exit_*) and empowercare.credential
-- (revoked_reason).
--
-- Column-level GRANTs cannot help: PostgREST executes every authenticated
-- request as the single `authenticated` role, so narrowing columns there
-- would narrow them for staff too.
--
-- So for exactly those three tables the vendor read path is a SECURITY
-- DEFINER FUNCTION that projects the permitted columns and nothing else, and
-- NO vendor policy is created on the base tables. For every other table the
-- whole row is safe to show, and a plain RLS policy is used.
--
-- No SECURITY DEFINER VIEW is created anywhere. Views in this database are
-- security_invoker = true without exception (the 2026-08-27 incident found 23
-- definer views bypassing RLS); functions are a different, auditable
-- mechanism with an explicit column list.
--
-- Idempotent: safe to run twice.
-- Rollback: see sql/MIGRATIONS.md (§0007).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Vendor, its users, and its cohort grants.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text        NOT NULL UNIQUE,
  name          text        NOT NULL,
  kind          text        NOT NULL DEFAULT 'VENDOR',
  contact_email text,
  status        text        NOT NULL DEFAULT 'ACTIVE',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_slug_shape CHECK (slug ~ '^[a-z][a-z0-9-]{1,40}$'),
  CONSTRAINT vendor_kind_check   CHECK (kind   IN ('VENDOR','FUNDER','AGENCY','FACILITY')),
  CONSTRAINT vendor_status_check CHECK (status IN ('ACTIVE','SUSPENDED'))
);

COMMENT ON TABLE public.vendor IS
  'An external organisation with view-only access scoped to the cohorts it '
  'has been granted. Not a tenant: vendors do not appear in core.tenant and '
  'own no data.';
COMMENT ON COLUMN public.vendor.status IS
  'SUSPENDED immediately revokes every access path — public.current_vendor_id() '
  'only resolves ACTIVE vendors.';

CREATE TABLE IF NOT EXISTS public.vendor_user (
  vendor_id uuid        NOT NULL REFERENCES public.vendor(id) ON DELETE CASCADE,
  user_id   uuid        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  added_at  timestamptz NOT NULL DEFAULT now(),
  added_by  uuid        REFERENCES public.staff_profiles(id)  ON DELETE SET NULL,
  PRIMARY KEY (vendor_id, user_id)
);

COMMENT ON TABLE public.vendor_user IS
  'Which auth users act for which vendor. This table, not the JWT role claim, '
  'is the authority for vendor access. Deleting a row revokes access on the '
  'next request.';

CREATE TABLE IF NOT EXISTS public.vendor_cohort (
  vendor_id  uuid        NOT NULL REFERENCES public.vendor(id)  ON DELETE CASCADE,
  cohort_id  uuid        NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid        REFERENCES public.staff_profiles(id)   ON DELETE SET NULL,
  revoked_at timestamptz,
  PRIMARY KEY (vendor_id, cohort_id)
);

COMMENT ON TABLE public.vendor_cohort IS
  'The view-only scope grant: one row = this vendor may see this cohort. '
  'Revocation sets revoked_at rather than deleting, so the grant history '
  'survives. A revoked row grants nothing.';

CREATE INDEX IF NOT EXISTS vendor_user_user_idx     ON public.vendor_user (user_id);
CREATE INDEX IF NOT EXISTS vendor_cohort_cohort_idx ON public.vendor_cohort (cohort_id);

-- ---------------------------------------------------------------------
-- 2. Scope helpers.
--    SECURITY DEFINER because they read tables the caller cannot read
--    (vendor_user, cohort_enrollments). Each pins search_path and returns
--    only a boolean or an id set — none of them can be coaxed into
--    returning a row the caller should not have.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_vendor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT vu.vendor_id
    FROM public.vendor_user vu
    JOIN public.vendor v ON v.id = vu.vendor_id AND v.status = 'ACTIVE'
   WHERE vu.user_id = auth.uid()
   LIMIT 1;
$function$;

COMMENT ON FUNCTION public.current_vendor_id() IS
  'The ACTIVE vendor the calling user acts for, or NULL. The single source of '
  'truth for vendor scoping; the JWT role claim is only a UI hint.';

CREATE OR REPLACE FUNCTION public.is_vendor()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.current_vendor_id() IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.vendor_cohort_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT vc.cohort_id
    FROM public.vendor_cohort vc
   WHERE vc.vendor_id = public.current_vendor_id()
     AND vc.revoked_at IS NULL;
$function$;

COMMENT ON FUNCTION public.vendor_cohort_ids() IS
  'Cohorts the calling vendor may see. Empty for everyone who is not a vendor, '
  'which is what makes every vendor policy below a no-op for staff and '
  'participants.';

CREATE OR REPLACE FUNCTION public.vendor_sees_participant(p_participant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.cohort_enrollments ce
     WHERE ce.participant_id = p_participant_id
       AND ce.cohort_id IN (SELECT public.vendor_cohort_ids())
  );
$function$;

COMMENT ON FUNCTION public.vendor_sees_participant(uuid) IS
  'True when the calling vendor has been granted a cohort this participant is '
  'enrolled in. Cohort membership is the only scope rule.';

-- empowercare.attendance keys on enrollment_id, and empowercare.enrollment is
-- itself RLS-protected, so the policy needs a definer hop to resolve the
-- participant behind an enrollment. This function returns a boolean only — it
-- never returns any enrollment column.
CREATE OR REPLACE FUNCTION public.vendor_sees_ec_enrollment(p_enrollment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'empowercare', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM empowercare.enrollment e
     WHERE e.id = p_enrollment_id
       AND public.vendor_sees_participant(e.participant_id)
  );
$function$;

REVOKE ALL     ON FUNCTION public.current_vendor_id()                FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.is_vendor()                        FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.vendor_cohort_ids()                FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.vendor_sees_participant(uuid)      FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.vendor_sees_ec_enrollment(uuid)    FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_vendor_id()                TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_vendor()                        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.vendor_cohort_ids()                TO authenticated;
GRANT  EXECUTE ON FUNCTION public.vendor_sees_participant(uuid)      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.vendor_sees_ec_enrollment(uuid)    TO authenticated;

-- ---------------------------------------------------------------------
-- 3. RLS on the new tables.
--    Staff administer them. A vendor may read its own vendor row and its own
--    cohort grants (so the UI can name what it has), and nothing about any
--    other vendor. Vendors can never write.
-- ---------------------------------------------------------------------
ALTER TABLE public.vendor        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_user   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_cohort ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_staff_all ON public.vendor;
CREATE POLICY vendor_staff_all ON public.vendor
  FOR ALL TO authenticated
  USING      (public.current_user_role() = ANY (ARRAY['super_admin','trainer']))
  WITH CHECK (public.current_user_role() = ANY (ARRAY['super_admin','trainer']));

DROP POLICY IF EXISTS vendor_self_read ON public.vendor;
CREATE POLICY vendor_self_read ON public.vendor
  FOR SELECT TO authenticated
  USING (id = public.current_vendor_id());

DROP POLICY IF EXISTS vendor_user_staff_all ON public.vendor_user;
CREATE POLICY vendor_user_staff_all ON public.vendor_user
  FOR ALL TO authenticated
  USING      (public.current_user_role() = ANY (ARRAY['super_admin','trainer']))
  WITH CHECK (public.current_user_role() = ANY (ARRAY['super_admin','trainer']));

DROP POLICY IF EXISTS vendor_user_self_read ON public.vendor_user;
CREATE POLICY vendor_user_self_read ON public.vendor_user
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS vendor_cohort_staff_all ON public.vendor_cohort;
CREATE POLICY vendor_cohort_staff_all ON public.vendor_cohort
  FOR ALL TO authenticated
  USING      (public.current_user_role() = ANY (ARRAY['super_admin','trainer']))
  WITH CHECK (public.current_user_role() = ANY (ARRAY['super_admin','trainer']));

DROP POLICY IF EXISTS vendor_cohort_self_read ON public.vendor_cohort;
CREATE POLICY vendor_cohort_self_read ON public.vendor_cohort
  FOR SELECT TO authenticated
  USING (vendor_id = public.current_vendor_id() AND revoked_at IS NULL);

-- ---------------------------------------------------------------------
-- 4. Vendor SELECT policies on existing tables.
--
--    All PERMISSIVE, all FOR SELECT, all additive: each one OR's with the
--    policies already on the table, so staff and participant access is
--    bit-for-bit unchanged. For any caller who is not a vendor,
--    vendor_cohort_ids() is empty and every predicate below is false.
-- ---------------------------------------------------------------------

-- 4a. The cohorts the vendor was granted.
DROP POLICY IF EXISTS cohorts_vendor_read ON public.cohorts;
CREATE POLICY cohorts_vendor_read ON public.cohorts
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.vendor_cohort_ids()));

-- 4b. Who is in them. Roster identity (names) is NOT here — see §5.
DROP POLICY IF EXISTS cohort_enrollments_vendor_read ON public.cohort_enrollments;
CREATE POLICY cohort_enrollments_vendor_read ON public.cohort_enrollments
  FOR SELECT TO authenticated
  USING (cohort_id IN (SELECT public.vendor_cohort_ids()));

-- 4c. Progress. edu_progress is (participant_id, lesson_id, completed_at) —
--     a completion ledger with no score in it. Safe to expose whole.
DROP POLICY IF EXISTS edu_progress_vendor_read ON public.edu_progress;
CREATE POLICY edu_progress_vendor_read ON public.edu_progress
  FOR SELECT TO authenticated
  USING (public.vendor_sees_participant(participant_id));

-- 4d. Completion. edu_credentials carries the credential and its status; no
--     score, no attempt history.
DROP POLICY IF EXISTS edu_credentials_vendor_read ON public.edu_credentials;
CREATE POLICY edu_credentials_vendor_read ON public.edu_credentials
  FOR SELECT TO authenticated
  USING (public.vendor_sees_participant(participant_id));

-- 4e. EmpowerCare attendance. Columns are enrollment_id, on_date,
--     contact_hours, recorded_by — no assessment data of any kind.
--
--     These ARE the caseworker-verifiable, staff-attested contact hours
--     (see the table's own annotation). They are deliberately the only
--     EmpowerCare rows a vendor can read directly.
DROP POLICY IF EXISTS attendance_vendor_read ON empowercare.attendance;
CREATE POLICY attendance_vendor_read ON empowercare.attendance
  FOR SELECT TO authenticated
  USING (public.vendor_sees_ec_enrollment(enrollment_id));

-- Not needed and not added: edu_courses / edu_modules / edu_lessons already
-- allow any authenticated user to read PUBLISHED course structure, which is
-- what a vendor needs to interpret edu_progress. Nothing further is granted.

-- ---------------------------------------------------------------------
-- 5. Column-minimised vendor read API.
--    The only path by which a vendor learns a participant's NAME, and the
--    only path to EmpowerCare completion.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vendor_roster()
RETURNS TABLE (
  participant_id     uuid,
  full_name          text,
  participant_status text,
  cohort_id          uuid,
  cohort_name        text,
  enrollment_status  text,
  enrolled_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.id,
         p.full_name,
         p.status::text,
         c.id,
         c.name,
         ce.enrollment_status::text,
         ce.enrolled_at
    FROM public.cohort_enrollments ce
    JOIN public.participants p ON p.id = ce.participant_id
    JOIN public.cohorts      c ON c.id = ce.cohort_id
   WHERE public.current_vendor_id() IS NOT NULL
     AND ce.cohort_id IN (SELECT public.vendor_cohort_ids())
   ORDER BY c.name, p.full_name;
$function$;

COMMENT ON FUNCTION public.vendor_roster() IS
  'Cohort roster for the calling vendor: name and status only. Deliberately '
  'omits dob, ldss_office, ldss_case_number, ldss_caseworker, notes, cts_id '
  'and assigned_trainer. Returns nothing for a caller who is not a vendor. '
  'Do not add columns to this function without a data-minimisation review.';

CREATE OR REPLACE FUNCTION public.vendor_empowercare_status()
RETURNS TABLE (
  participant_id      uuid,
  full_name           text,
  cohort_id           uuid,
  days_attended       integer,
  contact_hours       numeric,
  first_attendance    date,
  last_attendance     date,
  completion_status   text,
  completed_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'empowercare', 'pg_temp'
AS $function$
  SELECT p.id,
         p.full_name,
         e.cohort_id,
         COALESCE(a.days, 0)::integer,
         COALESCE(a.hours, 0)::numeric,
         a.first_on,
         a.last_on,
         -- Coarse mapping. WEEK_TWO_BLOCKED is the day-3 hard gate result and
         -- must never reach a vendor, so it collapses into IN_PROGRESS with
         -- every other mid-programme state.
         CASE e.state
           WHEN 'CERTIFIED'   THEN 'COMPLETED'
           WHEN 'REFRESH_DUE' THEN 'COMPLETED'
           WHEN 'COHORT_EXIT' THEN 'EXITED'
           ELSE 'IN_PROGRESS'
         END,
         e.completed_at
    FROM empowercare.enrollment e
    JOIN public.participants p ON p.id = e.participant_id
    LEFT JOIN LATERAL (
      SELECT count(*)          AS days,
             sum(contact_hours) AS hours,
             min(on_date)       AS first_on,
             max(on_date)       AS last_on
        FROM empowercare.attendance att
       WHERE att.enrollment_id = e.id
    ) a ON true
   WHERE public.current_vendor_id() IS NOT NULL
     AND public.vendor_sees_participant(e.participant_id)
   ORDER BY p.full_name;
$function$;

COMMENT ON FUNCTION public.vendor_empowercare_status() IS
  'EmpowerCare attendance totals plus a COARSE completion status for the '
  'calling vendor. Exposes no assessment score, no attempt, no remediation '
  'and no gate result: the raw enrollment state (which includes '
  'WEEK_TWO_BLOCKED, the day-3 caller-authentication gate) is mapped down to '
  'IN_PROGRESS / COMPLETED / EXITED before it leaves the database. Any change '
  'that widens this output needs a data-minimisation review.';

REVOKE ALL     ON FUNCTION public.vendor_roster()               FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.vendor_empowercare_status()   FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.vendor_roster()               TO authenticated;
GRANT  EXECUTE ON FUNCTION public.vendor_empowercare_status()   TO authenticated;

COMMIT;

-- =====================================================================
-- VERIFICATION (read-only) — uncomment after applying.
-- =====================================================================
-- -- Every vendor policy must be SELECT-only and PERMISSIVE:
-- SELECT schemaname, tablename, policyname, cmd, permissive
--   FROM pg_policies WHERE policyname LIKE '%vendor%' ORDER BY 1,2,3;
--
-- -- No vendor policy may exist on any of these:
-- SELECT schemaname, tablename, policyname FROM pg_policies
--  WHERE policyname LIKE '%vendor%'
--    AND tablename IN ('attempt','amendment','remediation','exam_form','audit',
--                      'assessment','artifact','artifact_exercise','enrollment',
--                      'credential','participants','edu_checkpoint_attempts',
--                      'call_sessions','call_scores','certifications',
--                      'score_matrix_weights');
--   expect: zero rows.
--
-- -- With no vendor session, both read APIs must be empty:
-- SELECT count(*) FROM public.vendor_roster();              -- expect 0
-- SELECT count(*) FROM public.vendor_empowercare_status();  -- expect 0
--
-- -- Wiring a vendor (staff / owner session):
-- INSERT INTO public.vendor (slug, name, kind, contact_email)
-- VALUES ('albany-ldss', 'Albany County DSS', 'AGENCY', 'ops@example.gov');
-- INSERT INTO public.vendor_user (vendor_id, user_id)
-- VALUES ('<vendor uuid>', '<auth.users uuid>');
-- INSERT INTO public.vendor_cohort (vendor_id, cohort_id)
-- VALUES ('<vendor uuid>', '<cohort uuid>');
-- -- and stamp APP metadata (not user metadata) with role='vendor'.
