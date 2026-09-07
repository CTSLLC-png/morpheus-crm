-- =====================================================================
-- 0009_role_metadata.sql
-- Make app_metadata.role the single, self-healing source of truth
--
-- Project: ymavrmekxiwdphdyteau
-- REVIEW BEFORE APPLYING. Additive only: no DROP, no change to any existing
-- table, column, policy or function. One optional hardening section at the
-- end is clearly marked and can be omitted.
--
-- ---------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------
-- Morpheus had two disagreeing sources of "role":
--
--   auth.users.raw_app_meta_data->>'role'   read by public.current_user_role(),
--                                           and therefore by every role-based
--                                           RLS policy. Service role writes only.
--
--   auth.users.raw_user_meta_data->>'role'  read by the React client, and
--                                           WRITABLE BY THE END USER with the
--                                           anon key.
--
-- Every account-creation path wrote only the second one. The app and the
-- database therefore had different ideas of who each user was, and any account
-- those paths created had a role RLS could not see.
--
-- The application-side fix (this branch) makes app_metadata authoritative
-- everywhere: the client reads it, the edge functions write it, and the edge
-- functions authorize their callers from it.
--
-- This migration closes the remaining hole: **nothing currently guarantees
-- app_metadata is ever populated at all.** Verified against production on
-- 2026-09-07:
--
--   * supabase/functions/on-user-signup is wired to NOTHING. There is no
--     non-internal trigger on auth.users and no database webhook invoking it.
--     It has never run. (The Auth Hook it claims to be registered as -- "after
--     user is created" -- is not a hook Supabase Auth offers.)
--   * All four existing accounts happen to have app_metadata.role set and
--     matching user_metadata, so nothing is broken today. That is four
--     accounts stamped by hand, not a working mechanism.
--   * public.participants has 2 rows, both with user_id IS NULL.
--
-- So a self-registering participant would get NO role, and a new vendor would
-- get NO role, until an operator wires up a webhook and remembers to keep it
-- wired. Relying on that is how this bug happened the first time.
--
-- ---------------------------------------------------------------------
-- WHAT THIS DOES INSTEAD
-- ---------------------------------------------------------------------
-- Derive the role from facts already in the database, at the moment those
-- facts are created:
--
--   a public.participants row with a user_id   ->  that user is a participant
--   a public.vendor_user row for an ACTIVE     ->  that user is a vendor
--     public.vendor
--
-- Both rows are created by a staff action or by redeem_cohort_invite(), which
-- is itself gated by a bearer code. Neither is a claim the user can make about
-- themselves, which is exactly what disqualified user_metadata.
--
-- Staff roles are NOT derived. `trainer` and `super_admin` come only from
-- create-morpheus-user, which requires an authenticated super_admin caller. A
-- staff_profiles row is deliberately not treated as evidence of anything: it
-- cannot distinguish trainer from super_admin, and inferring privilege from a
-- profile table is the shape of mistake this file exists to undo.
--
-- ---------------------------------------------------------------------
-- SAFETY -- READ THIS
-- ---------------------------------------------------------------------
-- These triggers UPDATE auth.users, a table this project does not own.
-- Two deliberate constraints on that:
--
--  1. FILL-ONLY, NEVER OVERWRITE. If app_metadata already carries a role, the
--     trigger leaves it alone. It can never demote a trainer to participant,
--     and re-running it is a no-op. That is what makes the backfill below safe
--     to run repeatedly.
--
--  2. IT CAN NEVER BREAK AN INSERT. The UPDATE is wrapped in an exception
--     block. If the function lacks privilege on auth.users -- which depends on
--     Supabase's grants to `postgres` and could change under us -- it raises a
--     WARNING into the Postgres log and the INSERT proceeds untouched. The
--     worst case is that this migration silently does nothing, which is
--     exactly where the system is today. The worst case is NOT that
--     participant intake starts failing in production.
--
--     Because of (2), a successful apply does not prove the stamp works.
--     VERIFY IT with the query in section 5 after applying.
--
-- Idempotent: safe to run twice.
-- Rollback: see sql/MIGRATIONS.md (S0009).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. The stamp.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_user_role(p_user_id uuid, p_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Only the two roles that can be derived from data. Anything else is a
  -- programming error in a caller, and must not become a grant.
  IF p_role NOT IN ('participant', 'vendor') THEN
    RAISE WARNING 'stamp_user_role refused role %; only participant and vendor are derivable', p_role;
    RETURN false;
  END IF;

  BEGIN
    SELECT raw_app_meta_data->>'role' INTO v_existing
      FROM auth.users WHERE id = p_user_id;

    -- Fill only. An existing role -- including a staff one -- always wins.
    IF v_existing IS NOT NULL AND v_existing <> '' THEN
      RETURN false;
    END IF;

    UPDATE auth.users
       SET raw_app_meta_data =
             coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role)
     WHERE id = p_user_id;

    RETURN true;
  EXCEPTION WHEN OTHERS THEN
    -- Insufficient privilege on auth.users, or anything else. Never propagate:
    -- a failure here must not take down participant intake or vendor setup.
    RAISE WARNING 'stamp_user_role could not stamp % for user %: %',
      p_role, p_user_id, SQLERRM;
    RETURN false;
  END;
END;
$$;

COMMENT ON FUNCTION public.stamp_user_role(uuid, text) IS
  'Fills auth.users.raw_app_meta_data->>''role'' when it is empty. Never '
  'overwrites an existing role, never raises, and accepts only the two roles '
  'derivable from data (participant, vendor). Staff roles come from '
  'create-morpheus-user, not from here.';

-- Not callable by clients. This is a trigger helper; the only legitimate
-- caller is the trigger, and an EXECUTE grant to `authenticated` would let any
-- signed-in user stamp any user id.
REVOKE ALL ON FUNCTION public.stamp_user_role(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_user_role(uuid, text) FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Participants.
--    Fires on INSERT and on an UPDATE that first attaches a user_id -- a
--    participant record created by staff before the login existed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_participant_stamp_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.stamp_user_role(NEW.user_id, 'participant');
  END IF;
  RETURN NULL;   -- AFTER trigger; return value is ignored
END;
$$;

DROP TRIGGER IF EXISTS participants_stamp_role ON public.participants;
CREATE TRIGGER participants_stamp_role
  AFTER INSERT OR UPDATE OF user_id ON public.participants
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.tg_participant_stamp_role();

-- ---------------------------------------------------------------------
-- 3. Vendor users.
--    Only an ACTIVE vendor confers the role, matching
--    public.current_vendor_id(). Attaching a user to a SUSPENDED vendor
--    stamps nothing -- correctly, since it grants nothing either.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_vendor_user_stamp_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.vendor v
     WHERE v.id = NEW.vendor_id AND v.status = 'ACTIVE'
  ) THEN
    PERFORM public.stamp_user_role(NEW.user_id, 'vendor');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS vendor_user_stamp_role ON public.vendor_user;
CREATE TRIGGER vendor_user_stamp_role
  AFTER INSERT ON public.vendor_user
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_vendor_user_stamp_role();

-- ---------------------------------------------------------------------
-- 4. Backfill existing accounts.
--    Fill-only, so this is a no-op for every account that already has a role
--    -- which today is all four of them.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT p.user_id AS uid, 'participant'::text AS role
      FROM public.participants p
     WHERE p.user_id IS NOT NULL
    UNION
    SELECT vu.user_id, 'vendor'
      FROM public.vendor_user vu
      JOIN public.vendor v ON v.id = vu.vendor_id AND v.status = 'ACTIVE'
  LOOP
    IF public.stamp_user_role(r.uid, r.role) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '0009 backfill: stamped % account(s)', n;
END;
$$;

-- ---------------------------------------------------------------------
-- 5. Visibility for staff.
--    A role mismatch used to be invisible -- that is most of why this bug
--    survived. This function lets the staff UI show it.
--
--    Not a view: a security_invoker view over auth.users would just raise
--    "permission denied for table users" for `authenticated`, which has no
--    grant on the auth schema and must not be given one. A SECURITY DEFINER
--    function with its own role check is the correct shape.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_user_role_health()
RETURNS TABLE (
  user_id           uuid,
  email             text,
  app_metadata_role text,   -- what RLS enforces
  claimed_role      text,   -- what user_metadata says; user-writable, advisory
  is_participant    boolean,
  is_vendor_user    boolean,
  is_staff_profile  boolean,
  created_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    u.id,
    u.email::text,
    u.raw_app_meta_data->>'role',
    u.raw_user_meta_data->>'role',
    EXISTS (SELECT 1 FROM public.participants p WHERE p.user_id = u.id),
    EXISTS (SELECT 1 FROM public.vendor_user vu
              JOIN public.vendor v ON v.id = vu.vendor_id AND v.status = 'ACTIVE'
             WHERE vu.user_id = u.id),
    EXISTS (SELECT 1 FROM public.staff_profiles s WHERE s.user_id = u.id),
    u.created_at
  FROM auth.users u
  WHERE public.current_user_role() IN ('super_admin', 'trainer')
  ORDER BY u.created_at DESC;
$$;

COMMENT ON FUNCTION public.staff_user_role_health() IS
  'Staff-only. One row per auth user showing the role RLS enforces '
  '(app_metadata) beside the role the user claims (user_metadata) and the '
  'memberships that should have produced one. Returns zero rows to anyone who '
  'is not a trainer or super_admin -- the WHERE clause is the authorization.';

REVOKE ALL ON FUNCTION public.staff_user_role_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_user_role_health() FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_user_role_health() TO authenticated;

COMMIT;

-- =====================================================================
-- 6. OPTIONAL HARDENING -- review separately, apply only if you agree.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, so these
-- three are currently executable by `anon`:
--
--     public.redeem_cohort_invite(text, text)
--     public.vendor_roster()
--     public.vendor_empowercare_status()
--
-- None of them leaks anything today: redeem_cohort_invite raises 28000 when
-- auth.uid() is null, and the two vendor functions resolve current_vendor_id()
-- to NULL for anon and return zero rows. This is surface reduction, not a
-- fix for a live leak -- which is why it is outside the transaction above and
-- separately optional.
--
-- It is NOT idempotent-safe to reason about casually: if anything ever calls
-- these from an unauthenticated context, this breaks it. Nothing on this
-- branch does.
--
-- Uncomment to apply:
--
-- REVOKE EXECUTE ON FUNCTION public.redeem_cohort_invite(text, text) FROM anon;
-- REVOKE EXECUTE ON FUNCTION public.vendor_roster() FROM anon;
-- REVOKE EXECUTE ON FUNCTION public.vendor_empowercare_status() FROM anon;
--
-- Rollback for this section:
-- GRANT EXECUTE ON FUNCTION public.redeem_cohort_invite(text, text) TO anon;
-- GRANT EXECUTE ON FUNCTION public.vendor_roster() TO anon;
-- GRANT EXECUTE ON FUNCTION public.vendor_empowercare_status() TO anon;
-- =====================================================================
