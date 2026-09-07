-- =====================================================================
-- 0006_cohort_invite_codes.sql
-- Cohort invite / enrolment codes — gate self-registration to a cohort
--
-- Project: ymavrmekxiwdphdyteau
-- REVIEW BEFORE APPLYING. Additive DDL only. No DROP, no change to any
-- existing table, policy or function.
--
-- ---------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------
-- Business decision: a participant self-registers with email + password
-- (the registered email IS the username) and that registration is gated by a
-- cohort invite code. Redeeming the code is what binds the new participant to
-- a cohort — vendor scoping, reporting and every cohort-shaped RLS rule in
-- this database key off cohort membership, so an ungated signup produces a
-- participant nobody can see and nobody is accountable for.
--
-- ---------------------------------------------------------------------
-- SECURITY MODEL — read this before touching the policies
-- ---------------------------------------------------------------------
-- An invite code is a BEARER SECRET. Anyone holding it can join a cohort.
-- Therefore:
--   * NO participant, vendor or anonymous SELECT policy exists on
--     cohort_invite_code. Only staff (super_admin / trainer) can read or
--     write the table. A `SELECT * FROM cohort_invite_code` from a
--     participant session returns zero rows, by design.
--   * Redemption goes through public.redeem_cohort_invite(), a
--     SECURITY DEFINER function. That is the ONLY way a non-staff session can
--     learn anything about a code, and all it ever learns is
--     redeemed / not redeemed. It never returns the code list, never
--     confirms that an unrelated code exists, and never leaks the cohort of a
--     code it refuses.
--   * The function requires an authenticated session (auth.uid()). Codes are
--     therefore not probeable by anonymous traffic. Sign up first, redeem
--     second.
--
-- KNOWN GAP, deliberately not solved here: an authenticated attacker can call
-- redeem_cohort_invite() in a loop to brute-force codes. Mitigations are
-- operational (long random codes — the format check below enforces >= 8
-- chars — short expiry, low max_uses) plus rate limiting at the API gateway.
-- A lockout table was considered and rejected as scope creep for a schema
-- migration; it is flagged in sql/MIGRATIONS.md instead.
--
-- Idempotent: safe to run twice.
-- Rollback: see sql/MIGRATIONS.md (§0006).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. The code itself.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_invite_code (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id   uuid        NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  code        text        NOT NULL UNIQUE,
  label       text,                        -- free-text, e.g. which facility got it
  max_uses    integer,                     -- NULL = unlimited
  uses        integer     NOT NULL DEFAULT 0,
  expires_at  timestamptz,                 -- NULL = never expires
  revoked_at  timestamptz,                 -- non-NULL = dead, permanently
  created_by  uuid        REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Codes are typed by hand off a printed sheet, so they are stored and
  -- compared upper-case. 8 chars minimum makes blind guessing impractical.
  CONSTRAINT cohort_invite_code_shape
    CHECK (code = upper(code) AND code ~ '^[A-Z0-9-]{8,32}$'),
  CONSTRAINT cohort_invite_code_max_uses_positive
    CHECK (max_uses IS NULL OR max_uses > 0),
  CONSTRAINT cohort_invite_code_uses_nonneg
    CHECK (uses >= 0)
);

COMMENT ON TABLE public.cohort_invite_code IS
  'Bearer codes that gate participant self-registration and bind the new '
  'participant to one cohort. Readable by staff only — never expose this '
  'table to participants, vendors or anon. Redemption goes through '
  'public.redeem_cohort_invite().';
COMMENT ON COLUMN public.cohort_invite_code.revoked_at IS
  'Revocation is a timestamp, not a delete: a revoked code must stay '
  'resolvable so past redemptions keep their audit trail.';
COMMENT ON COLUMN public.cohort_invite_code.uses IS
  'Maintained by public.redeem_cohort_invite(). Do not increment by hand.';

CREATE INDEX IF NOT EXISTS cohort_invite_code_cohort_idx
  ON public.cohort_invite_code (cohort_id);

-- ---------------------------------------------------------------------
-- 2. Redemption ledger — who used which code, and when.
--    Append-only in practice: nothing in this migration ever updates or
--    deletes a row here.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_invite_redemption (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code_id uuid        NOT NULL REFERENCES public.cohort_invite_code(id) ON DELETE RESTRICT,
  participant_id uuid        NOT NULL REFERENCES public.participants(id) ON DELETE RESTRICT,
  user_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at    timestamptz NOT NULL DEFAULT now(),

  -- One participant redeems a given code at most once.
  CONSTRAINT cohort_invite_redemption_once UNIQUE (invite_code_id, participant_id)
);

COMMENT ON TABLE public.cohort_invite_redemption IS
  'Audit trail of invite-code redemptions. ON DELETE RESTRICT on both FKs: a '
  'code or participant with a redemption cannot be deleted out from under the '
  'record.';

CREATE INDEX IF NOT EXISTS cohort_invite_redemption_participant_idx
  ON public.cohort_invite_redemption (participant_id);

-- ---------------------------------------------------------------------
-- 3. RLS.
-- ---------------------------------------------------------------------
ALTER TABLE public.cohort_invite_code       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_invite_redemption ENABLE ROW LEVEL SECURITY;

-- Staff only. Mirrors the "Staff can manage cohorts" policy already on
-- public.cohorts, so a code inherits exactly the audience of the cohort it
-- belongs to.
DROP POLICY IF EXISTS cohort_invite_code_staff_all ON public.cohort_invite_code;
CREATE POLICY cohort_invite_code_staff_all
  ON public.cohort_invite_code
  FOR ALL
  TO authenticated
  USING      (public.current_user_role() = ANY (ARRAY['super_admin','trainer']))
  WITH CHECK (public.current_user_role() = ANY (ARRAY['super_admin','trainer']));

DROP POLICY IF EXISTS cohort_invite_redemption_staff_read ON public.cohort_invite_redemption;
CREATE POLICY cohort_invite_redemption_staff_read
  ON public.cohort_invite_redemption
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['super_admin','trainer']));

-- A participant may see the fact that they themselves redeemed a code. This
-- exposes no code value — the code text lives on the other table, which they
-- cannot read.
DROP POLICY IF EXISTS cohort_invite_redemption_own_read ON public.cohort_invite_redemption;
CREATE POLICY cohort_invite_redemption_own_read
  ON public.cohort_invite_redemption
  FOR SELECT
  TO authenticated
  USING (participant_id = public.current_participant_id());

-- No INSERT policy for anyone. Rows arrive only via
-- public.redeem_cohort_invite(), which is SECURITY DEFINER and therefore
-- bypasses RLS on purpose. Staff who need to correct the ledger should do it
-- as the table owner, so the correction is deliberate.

-- ---------------------------------------------------------------------
-- 4. Redemption.
--
--    Returns the cohort the caller was bound to. Raises — with a message
--    that never distinguishes "no such code" from "expired" / "revoked" /
--    "used up" — otherwise.
--
--    Creating the participants row here is intentional: business decision 4
--    is that the participant self-registers, and there is no staff step
--    between the auth signup and the cohort binding. public.participants has
--    a BEFORE INSERT trigger (trg_generate_cts_id) that fills cts_id when it
--    is passed empty, so the CTS-XXXXX series stays authoritative.
--
--    program_source is copied from the cohort. It is a NOT NULL enum on
--    participants and the cohort is the only trustworthy source for it at
--    registration time — a self-registering participant must not be allowed
--    to declare their own funding stream.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_cohort_invite(
  p_code      text,
  p_full_name text DEFAULT NULL
)
-- The OUT parameters are prefixed `bound_`. They must not be named
-- cohort_id / participant_id: PL/pgSQL puts OUT parameters in scope inside
-- the body, where they would shadow the identically named COLUMNS in the
-- ON CONFLICT clauses below and raise "column reference is ambiguous" at
-- runtime. Renaming the columns of the result is the safe half of that trade.
RETURNS TABLE (bound_cohort_id uuid, bound_cohort_name text, bound_participant_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_code   public.cohort_invite_code%ROWTYPE;
  v_pid    uuid;
  v_cohort public.cohorts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'redeem_cohort_invite requires an authenticated session'
      USING ERRCODE = '28000';
  END IF;

  -- FOR UPDATE serialises concurrent redemptions of the same code, so
  -- max_uses cannot be overrun by two simultaneous signups.
  SELECT * INTO v_code
    FROM public.cohort_invite_code c
   WHERE c.code = upper(btrim(p_code))
   FOR UPDATE;

  -- One message for every failure mode. Do not "improve" this by reporting
  -- which check failed: that turns the function into a code oracle.
  IF v_code.id IS NULL
     OR v_code.revoked_at IS NOT NULL
     OR (v_code.expires_at IS NOT NULL AND v_code.expires_at <= now())
     OR (v_code.max_uses  IS NOT NULL AND v_code.uses >= v_code.max_uses)
  THEN
    RAISE EXCEPTION 'That enrolment code is not valid.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cohort FROM public.cohorts WHERE id = v_code.cohort_id;

  SELECT p.id INTO v_pid FROM public.participants p WHERE p.user_id = v_uid;

  IF v_pid IS NULL THEN
    IF p_full_name IS NULL OR btrim(p_full_name) = '' THEN
      RAISE EXCEPTION 'A full name is required to complete registration.'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.participants
      (user_id, cts_id, full_name, program_source, enrollment_date, status)
    VALUES
      (v_uid, '', btrim(p_full_name), v_cohort.program_source, CURRENT_DATE, 'Active')
    RETURNING id INTO v_pid;
  END IF;

  -- Bind to the cohort. Already-enrolled is not an error: re-running the
  -- registration step must be safe.
  INSERT INTO public.cohort_enrollments (cohort_id, participant_id)
  VALUES (v_code.cohort_id, v_pid)
  ON CONFLICT (cohort_id, participant_id) DO NOTHING;

  INSERT INTO public.cohort_invite_redemption
    (invite_code_id, participant_id, user_id)
  VALUES (v_code.id, v_pid, v_uid)
  ON CONFLICT (invite_code_id, participant_id) DO NOTHING;

  -- Only count a use the first time this participant redeems this code, so a
  -- retried request cannot burn the cohort's remaining seats.
  IF FOUND THEN
    UPDATE public.cohort_invite_code
       SET uses = uses + 1
     WHERE id = v_code.id;
  END IF;

  RETURN QUERY SELECT v_cohort.id, v_cohort.name, v_pid;
END;
$function$;

COMMENT ON FUNCTION public.redeem_cohort_invite(text, text) IS
  'Bind the calling authenticated user to a cohort by invite code, creating '
  'their participants row on first redemption. SECURITY DEFINER: it is the '
  'only sanctioned read path into public.cohort_invite_code. Every rejection '
  'returns the same message so the function cannot be used to enumerate '
  'codes.';

REVOKE ALL     ON FUNCTION public.redeem_cohort_invite(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.redeem_cohort_invite(text, text) TO authenticated;

COMMIT;

-- =====================================================================
-- VERIFICATION (read-only) — uncomment after applying.
-- =====================================================================
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname IN ('cohort_invite_code','cohort_invite_redemption');
--   expect relrowsecurity = true on both.
--
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE tablename IN ('cohort_invite_code','cohort_invite_redemption');
--   expect: no policy grants SELECT on cohort_invite_code to anyone but staff.
--
-- Issuing a code (staff session, or as table owner):
-- INSERT INTO public.cohort_invite_code (cohort_id, code, label, max_uses, expires_at)
-- VALUES ('<cohort uuid>', 'CLRC-2026-ALB1', 'Albany reentry cohort', 20,
--         now() + interval '60 days');
