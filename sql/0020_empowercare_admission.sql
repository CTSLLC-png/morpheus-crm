-- =====================================================================
-- 0020_empowercare_admission.sql
-- EmpowerCare admission: ClearCall-CSR graduation, or a documented
-- prior-experience waiver.
--
-- Project: ymavrmekxiwdphdyteau
-- Additive DDL + one BEFORE INSERT trigger. No DROP of any existing
-- table, column, policy or function. Idempotent.
--
-- ---------------------------------------------------------------------
-- WHAT THIS IMPLEMENTS
-- ---------------------------------------------------------------------
-- Business rule: EmpowerCare is a continuance from ClearCall-CSR. A
-- participant may not enter EmpowerCare until they have graduated
-- ClearCall-CSR, UNLESS they are excepted on the basis of prior work
-- experience meeting the programme's criteria.
--
-- "Graduated ClearCall-CSR" is defined here as holding a live
-- public.edu_credentials row for the CLEARCALL-CSR course: status
-- 'active', not past expires_at. That is the credential staff issue
-- through edu.js issueCredential(), it carries a registry code, and it is
-- publicly checkable at /verify/<code>. Using the credential rather than
-- raw lesson progress means admission rests on the same artefact the
-- outside world can verify.
--
-- ---------------------------------------------------------------------
-- WHAT THIS DELIBERATELY DOES NOT TOUCH
-- ---------------------------------------------------------------------
-- The EmpowerCare assessment matrix. empowercare.assessment, gate_block(),
-- enforce_gate_on_attempt(), cohort_blockers() and the day-3 hard
-- caller-authentication gate are untouched and unreferenced here.
--
-- Those gates govern PROGRESSION THROUGH the programme. This governs
-- ADMISSION TO it. They are separate questions and are deliberately kept
-- in separate mechanisms: a change to who may enrol must never be able to
-- move a compliance threshold by accident.
--
-- ---------------------------------------------------------------------
-- ONE THING THE BUSINESS STILL HAS TO DEFINE
-- ---------------------------------------------------------------------
-- The exception is "prior work experience meeting requirements/criteria".
-- Those criteria are not stated anywhere in this repository, and are NOT
-- invented here. A waiver therefore requires a written basis and a named
-- approver, and the rule enforced is "an authorised human recorded why" —
-- not a machine test of years served.
--
-- When the criteria are written down, the right follow-up is a small
-- catalogue table that `basis` can reference, so waivers become
-- checkable rather than merely attributable. Flagged, not guessed.
--
-- Idempotent: safe to run twice.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. The waiver.
--
--    This is an audit record about a real person's admission to a
--    credentialing programme, so it is written to be defensible later:
--    who approved it, when, on what stated basis, and against what
--    evidence. Revocation is a timestamp, never a delete.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empowercare.admission_waiver (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid        NOT NULL REFERENCES public.participants(id) ON DELETE RESTRICT,
  basis          text        NOT NULL,
  evidence       text,
  approved_by    uuid        NOT NULL REFERENCES public.staff_profiles(id) ON DELETE RESTRICT,
  approved_at    timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz,
  revoked_at     timestamptz,
  revoked_by     uuid        REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  revoked_reason text,
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- A waiver with a blank justification is not a waiver, it is an
  -- unexplained exception. Require actual words.
  CONSTRAINT admission_waiver_basis_present
    CHECK (btrim(basis) <> ''),
  -- Revocation must say who and why, for the same reason admission must.
  CONSTRAINT admission_waiver_revocation_complete
    CHECK (revoked_at IS NULL
           OR (revoked_by IS NOT NULL AND btrim(coalesce(revoked_reason,'')) <> '')),
  CONSTRAINT admission_waiver_expiry_after_approval
    CHECK (expires_at IS NULL OR expires_at > approved_at)
);

COMMENT ON TABLE empowercare.admission_waiver IS
  'Exception admitting a participant to EmpowerCare without a ClearCall-CSR '
  'credential, on the basis of prior work experience. An audit record: '
  'approver and written basis are mandatory, and revocation is a timestamp '
  'rather than a delete so the history of an admission decision survives.';
COMMENT ON COLUMN empowercare.admission_waiver.basis IS
  'Why this participant qualifies without the prerequisite. Free text '
  'because the programme''s prior-experience criteria are not yet defined; '
  'once they are, this should reference a criteria catalogue so waivers '
  'become checkable rather than only attributable.';
COMMENT ON COLUMN empowercare.admission_waiver.evidence IS
  'Pointer to the documentation relied on (employment letter, reference, '
  'file note). Deliberately a reference, not the document: no employment '
  'record is stored in this table.';

CREATE INDEX IF NOT EXISTS admission_waiver_participant_idx
  ON empowercare.admission_waiver (participant_id);

-- ---------------------------------------------------------------------
-- 2. Does this participant hold a live ClearCall-CSR credential?
--
--    SECURITY DEFINER because the caller may be a trainer acting on a
--    participant they can see, while edu_credentials RLS is written for
--    the credential holder. Returns a boolean only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION empowercare.has_clearcall_credential(p_participant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.edu_credentials ec
      JOIN public.edu_courses c ON c.id = ec.course_id
     WHERE ec.participant_id = p_participant_id
       AND c.code = 'CLEARCALL-CSR'
       AND coalesce(ec.status, 'active') = 'active'
       AND (ec.expires_at IS NULL OR ec.expires_at > now())
  );
$function$;

COMMENT ON FUNCTION empowercare.has_clearcall_credential(uuid) IS
  'True when the participant holds a live CLEARCALL-CSR credential — '
  'status active and not expired. This is what "graduated ClearCall" means '
  'for admission purposes.';

-- ---------------------------------------------------------------------
-- 3. Admission status, with the reason.
--
--    Returns the basis as well as the verdict, because "may they enrol"
--    and "why were they admitted" are both questions staff and auditors
--    ask, and answering only the first forces the second to be
--    reconstructed by hand later.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION empowercare.admission_status(p_participant_id uuid)
RETURNS TABLE (
  eligible    boolean,
  basis       text,
  credentialed boolean,
  waiver_id   uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'empowercare', 'public', 'pg_temp'
AS $function$
  WITH cred AS (
    SELECT empowercare.has_clearcall_credential(p_participant_id) AS ok
  ),
  waiver AS (
    SELECT w.id
      FROM empowercare.admission_waiver w
     WHERE w.participant_id = p_participant_id
       AND w.revoked_at IS NULL
       AND (w.expires_at IS NULL OR w.expires_at > now())
     ORDER BY w.approved_at DESC
     LIMIT 1
  )
  SELECT
    (SELECT ok FROM cred) OR (SELECT id FROM waiver) IS NOT NULL,
    CASE
      WHEN (SELECT ok FROM cred)              THEN 'CLEARCALL_GRADUATE'
      WHEN (SELECT id FROM waiver) IS NOT NULL THEN 'PRIOR_EXPERIENCE_WAIVER'
      ELSE 'NOT_ELIGIBLE'
    END,
    (SELECT ok FROM cred),
    (SELECT id FROM waiver);
$function$;

COMMENT ON FUNCTION empowercare.admission_status(uuid) IS
  'Whether a participant may be admitted to EmpowerCare, and on what basis: '
  'CLEARCALL_GRADUATE, PRIOR_EXPERIENCE_WAIVER, or NOT_ELIGIBLE. The '
  'credential is preferred over the waiver when both exist, so the record '
  'shows the stronger ground.';

-- ---------------------------------------------------------------------
-- 4. Record the basis on the enrolment itself.
--    Two nullable columns. Additive: no existing row changes, and nothing
--    that reads empowercare.enrollment today is affected.
-- ---------------------------------------------------------------------
ALTER TABLE empowercare.enrollment
  ADD COLUMN IF NOT EXISTS admission_basis text;
ALTER TABLE empowercare.enrollment
  ADD COLUMN IF NOT EXISTS admission_waiver_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'enrollment_admission_waiver_fkey'
       AND conrelid = 'empowercare.enrollment'::regclass
  ) THEN
    ALTER TABLE empowercare.enrollment
      ADD CONSTRAINT enrollment_admission_waiver_fkey
      FOREIGN KEY (admission_waiver_id)
      REFERENCES empowercare.admission_waiver(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN empowercare.enrollment.admission_basis IS
  'How this participant qualified for EmpowerCare at the moment of '
  'enrolment: CLEARCALL_GRADUATE or PRIOR_EXPERIENCE_WAIVER. Stamped by '
  'trg_enforce_admission; not hand-entered.';

-- ---------------------------------------------------------------------
-- 5. Enforce it.
--
--    A trigger rather than a CHECK: the rule depends on other tables, so
--    it cannot be expressed as a row constraint. BEFORE INSERT so the
--    basis can be stamped on the row being written.
--
--    Staff bypass is deliberately NOT provided. A trainer who believes
--    someone should be admitted records a waiver, which names them and
--    states why. That is the whole point of the exception path: it is
--    auditable, where a silent override would not be.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION empowercare.enforce_admission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'empowercare', 'public', 'pg_temp'
AS $function$
DECLARE
  v_eligible boolean;
  v_basis    text;
  v_waiver   uuid;
  v_name     text;
BEGIN
  SELECT s.eligible, s.basis, s.waiver_id
    INTO v_eligible, v_basis, v_waiver
    FROM empowercare.admission_status(NEW.participant_id) s;

  IF NOT v_eligible THEN
    SELECT full_name INTO v_name FROM public.participants WHERE id = NEW.participant_id;
    RAISE EXCEPTION
      '% cannot be enrolled in EmpowerCare: it continues from ClearCall-CSR. '
      'Issue their ClearCall-CSR credential first, or record a prior-experience '
      'admission waiver (empowercare.admission_waiver).',
      coalesce(v_name, 'This participant')
      USING ERRCODE = '23514';
  END IF;

  NEW.admission_basis     := v_basis;
  NEW.admission_waiver_id := v_waiver;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION empowercare.enforce_admission() IS
  'Admission gate for EmpowerCare. Rejects an enrolment unless the '
  'participant holds a live ClearCall-CSR credential or an active waiver, '
  'and stamps which of the two admitted them. Does not touch the '
  'progression gates in empowercare.assessment.';

DROP TRIGGER IF EXISTS trg_enforce_admission ON empowercare.enrollment;
CREATE TRIGGER trg_enforce_admission
  BEFORE INSERT OR UPDATE OF participant_id ON empowercare.enrollment
  FOR EACH ROW EXECUTE FUNCTION empowercare.enforce_admission();

-- ---------------------------------------------------------------------
-- 6. RLS. Staff only — a waiver names its approver and states a reason
--    about a person's work history, and neither participants nor vendors
--    have any business reading it.
-- ---------------------------------------------------------------------
ALTER TABLE empowercare.admission_waiver ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admission_waiver_staff_all ON empowercare.admission_waiver;
CREATE POLICY admission_waiver_staff_all
  ON empowercare.admission_waiver
  FOR ALL
  TO authenticated
  USING      (public.current_user_role() = ANY (ARRAY['super_admin','trainer']))
  WITH CHECK (public.current_user_role() = ANY (ARRAY['super_admin','trainer']));

GRANT SELECT, INSERT, UPDATE ON empowercare.admission_waiver TO authenticated;
-- No DELETE grant: a waiver is revoked, not erased.

GRANT EXECUTE ON FUNCTION empowercare.admission_status(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION empowercare.has_clearcall_credential(uuid)    TO authenticated;

COMMIT;

-- =====================================================================
-- VERIFICATION (read-only) — run after applying.
-- =====================================================================
-- -- Nobody is admissible without a credential or a waiver:
-- SELECT * FROM empowercare.admission_status('<participant uuid>');
--   expect eligible = false, basis = 'NOT_ELIGIBLE' for a fresh participant.
--
-- -- The progression gates are untouched:
-- SELECT key, gate_type, threshold FROM empowercare.assessment ORDER BY sort_order;
--   expect 11 rows, d3 still gate_type 'hard' at threshold 1.00.
--
-- -- The trigger exists and fires before insert:
-- SELECT tgname, tgenabled FROM pg_trigger
--  WHERE tgrelid = 'empowercare.enrollment'::regclass AND NOT tgisinternal;
