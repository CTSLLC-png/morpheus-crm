-- =====================================================================
-- 0021_staff_profiles_and_partner_access.sql
-- Restore the staff profile rows, and split partner administration so
-- granting access is narrower than revoking it.
--
-- Project: ymavrmekxiwdphdyteau
-- Additive DDL + a small data restore + a policy change. No table or
-- column is dropped. Idempotent.
--
-- ---------------------------------------------------------------------
-- PART 1 — WHY THE STAFF PROFILES ARE BEING RESTORED
-- ---------------------------------------------------------------------
-- public.staff_profiles is empty. It held four rows in September; the
-- auth accounts and their app_metadata roles are intact, so everyone can
-- still sign in, but nothing links those accounts to a profile.
--
-- That breaks more than a directory listing, because several columns are
-- foreign keys to staff_profiles(id):
--
--   cohort_invite_code.created_by        -> can only be NULL
--   vendor_cohort.granted_by             -> can only be NULL
--   vendor_user.added_by                 -> can only be NULL
--   empowercare.admission_waiver.approved_by  -> NOT NULL
--
-- The last one is the sharp edge: approved_by is NOT NULL, so with no
-- staff profiles in existence NO prior-experience admission waiver can be
-- recorded at all. The EmpowerCare exception path is unusable until this
-- runs.
--
-- The four rows below are restored from the values the table actually
-- held, matched to the live auth accounts by email. Nothing is invented:
-- an account whose email is not found is simply skipped.
--
-- ---------------------------------------------------------------------
-- PART 2 — WHY PARTNER ACCESS IS SPLIT
-- ---------------------------------------------------------------------
-- Issuing an enrolment code and granting a partner organisation access
-- look alike — both are staff screens — but they are different decisions.
--
-- An enrolment code is operational and reversible: it admits someone to a
-- cohort, it carries max_uses, expiry and revocation, every redemption is
-- logged, and the new participant can see nobody's data but their own.
-- That stays available to trainers, who are the people actually running
-- cohorts.
--
-- A partner grant is a DISCLOSURE: it gives an outside organisation
-- standing visibility of justice-involved participants' progress and
-- attendance. The harm is asymmetric — a wrong enrolment is reversible, a
-- wrong disclosure can be revoked but not un-disclosed — and it happens
-- rarely, so a bottleneck costs little. Granting therefore becomes
-- super_admin only.
--
-- Revoking does NOT. Revocation is the safety-increasing direction, and
-- anyone who can see a problem should be able to stop it without hunting
-- for the one person who holds the privilege. This matters concretely
-- here: the project has exactly one super_admin.
--
-- RLS cannot express "may update this column but not that one" — it
-- filters rows, not columns. So trainers lose direct write access to the
-- vendor tables entirely and revoke through SECURITY DEFINER functions
-- with a fixed, auditable effect. Hiding buttons alone would be theatre:
-- a trainer could still call PostgREST directly.
--
-- Idempotent: safe to run twice.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Restore the staff profiles.
--    Matched to auth.users by email; UNIQUE (user_id) makes this a no-op
--    on a second run. Skips silently if an email is absent.
-- ---------------------------------------------------------------------
INSERT INTO public.staff_profiles (user_id, full_name, title)
SELECT u.id, v.full_name, v.title
FROM (VALUES
  ('tyrone.pettway@ctsllc.group', 'Tyrone Pettway', 'Founder & Chief Standards Architect'),
  ('determinedman42@gmail.com',   'Trainer',        'Lead'),
  ('kyana605@aol.com',            'Kyana Pettway',  'Lead Trainer'),
  ('kyana605@icloud.com',         'Kyana Pettway',  'Trainer')
) AS v(email, full_name, title)
JOIN auth.users u ON lower(u.email) = lower(v.email)
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Attribution for the revoke path.
--    Granting already records granted_by/added_by. Revoking recorded
--    only a timestamp, which answers "when" but not "who" — the question
--    actually asked after an access incident.
-- ---------------------------------------------------------------------
ALTER TABLE public.vendor_cohort
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.vendor
  ADD COLUMN IF NOT EXISTS suspended_at    timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by    uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspend_reason  text;

COMMENT ON COLUMN public.vendor_cohort.revoked_by IS
  'Who withdrew this cohort grant. revoked_at alone answers when, not who.';
COMMENT ON COLUMN public.vendor.suspend_reason IS
  'Why the partner was suspended. Recorded because suspension is an access '
  'decision about an external organisation and will be asked about later.';

-- ---------------------------------------------------------------------
-- 3. Who am I, as a staff profile.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_staff_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT id FROM public.staff_profiles WHERE user_id = auth.uid() LIMIT 1;
$function$;

COMMENT ON FUNCTION public.current_staff_profile_id() IS
  'The calling user''s staff_profiles id, or NULL. Used to attribute staff '
  'actions without trusting a client-supplied id.';

REVOKE ALL     ON FUNCTION public.current_staff_profile_id() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_staff_profile_id() TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Policies: granting narrows to super_admin, reading stays open to
--    staff, and the partner's own read of itself is untouched.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_staff_all         ON public.vendor;
DROP POLICY IF EXISTS vendor_user_staff_all    ON public.vendor_user;
DROP POLICY IF EXISTS vendor_cohort_staff_all  ON public.vendor_cohort;

DROP POLICY IF EXISTS vendor_super_admin_all ON public.vendor;
CREATE POLICY vendor_super_admin_all ON public.vendor
  FOR ALL TO authenticated
  USING      (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');

DROP POLICY IF EXISTS vendor_staff_read ON public.vendor;
CREATE POLICY vendor_staff_read ON public.vendor
  FOR SELECT TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['super_admin','trainer']));

DROP POLICY IF EXISTS vendor_user_super_admin_all ON public.vendor_user;
CREATE POLICY vendor_user_super_admin_all ON public.vendor_user
  FOR ALL TO authenticated
  USING      (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');

DROP POLICY IF EXISTS vendor_user_staff_read ON public.vendor_user;
CREATE POLICY vendor_user_staff_read ON public.vendor_user
  FOR SELECT TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['super_admin','trainer']));

DROP POLICY IF EXISTS vendor_cohort_super_admin_all ON public.vendor_cohort;
CREATE POLICY vendor_cohort_super_admin_all ON public.vendor_cohort
  FOR ALL TO authenticated
  USING      (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');

DROP POLICY IF EXISTS vendor_cohort_staff_read ON public.vendor_cohort;
CREATE POLICY vendor_cohort_staff_read ON public.vendor_cohort
  FOR SELECT TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['super_admin','trainer']));

-- ---------------------------------------------------------------------
-- 5. The revoke path.
--
--    SECURITY DEFINER so a trainer can take these specific actions while
--    holding no direct write on the tables. Each one checks the caller is
--    staff, does exactly one thing, and records who did it. None of them
--    can grant: there is deliberately no reinstate here, because putting
--    access back is the dangerous direction and belongs to super_admin
--    through the ordinary policy.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendor_suspend(p_vendor_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'super_admin'
     AND public.current_user_role() IS DISTINCT FROM 'trainer' THEN
    RAISE EXCEPTION 'Only staff may suspend a partner.' USING ERRCODE = '42501';
  END IF;
  IF btrim(coalesce(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'A reason is required to suspend a partner.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.vendor
     SET status         = 'SUSPENDED',
         suspended_at   = now(),
         suspended_by   = public.current_staff_profile_id(),
         suspend_reason = btrim(p_reason)
   WHERE id = p_vendor_id;
END;
$function$;

COMMENT ON FUNCTION public.vendor_suspend(uuid, text) IS
  'Suspend a partner immediately. Available to trainers as well as super '
  'admins: cutting off access is the safety-increasing direction and must '
  'not wait on one person. current_vendor_id() resolves only ACTIVE '
  'partners, so this takes effect on their next request.';

CREATE OR REPLACE FUNCTION public.vendor_revoke_cohort(p_vendor_id uuid, p_cohort_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'super_admin'
     AND public.current_user_role() IS DISTINCT FROM 'trainer' THEN
    RAISE EXCEPTION 'Only staff may withdraw a cohort grant.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.vendor_cohort
     SET revoked_at = now(),
         revoked_by = public.current_staff_profile_id()
   WHERE vendor_id = p_vendor_id
     AND cohort_id = p_cohort_id
     AND revoked_at IS NULL;
END;
$function$;

COMMENT ON FUNCTION public.vendor_revoke_cohort(uuid, uuid) IS
  'Withdraw one cohort from a partner. Sets revoked_at rather than deleting, '
  'so the grant history survives. Available to trainers.';

CREATE OR REPLACE FUNCTION public.vendor_detach_user(p_vendor_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'super_admin'
     AND public.current_user_role() IS DISTINCT FROM 'trainer' THEN
    RAISE EXCEPTION 'Only staff may remove a partner user.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.vendor_user
   WHERE vendor_id = p_vendor_id AND user_id = p_user_id;
END;
$function$;

COMMENT ON FUNCTION public.vendor_detach_user(uuid, uuid) IS
  'Remove one person''s access to a partner organisation. A delete rather '
  'than a flag because vendor_user is a membership list, not a history; the '
  'account itself is untouched.';

REVOKE ALL     ON FUNCTION public.vendor_suspend(uuid, text)        FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.vendor_revoke_cohort(uuid, uuid)  FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.vendor_detach_user(uuid, uuid)    FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.vendor_suspend(uuid, text)        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.vendor_revoke_cohort(uuid, uuid)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.vendor_detach_user(uuid, uuid)    TO authenticated;

COMMIT;

-- =====================================================================
-- VERIFICATION (read-only) — run after applying.
-- =====================================================================
-- SELECT sp.full_name, sp.title, u.email, u.raw_app_meta_data->>'role'
--   FROM public.staff_profiles sp JOIN auth.users u ON u.id = sp.user_id
--  ORDER BY sp.full_name;                      -- expect 4 rows
--
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE tablename IN ('vendor','vendor_user','vendor_cohort') ORDER BY 1,3,2;
--   expect: *_super_admin_all (ALL), *_staff_read (SELECT),
--           vendor_self_read / vendor_cohort_self_read (SELECT) — and NO
--           policy granting a trainer INSERT or UPDATE.
--
-- -- A waiver can now be recorded (this was impossible before):
-- SELECT public.current_staff_profile_id();    -- non-NULL for staff
