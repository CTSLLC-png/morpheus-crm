-- =====================================================================
-- 0008_engagement_tracking.sql
-- Auto-tracked engagement: login events and time-in-module
--
-- Project: ymavrmekxiwdphdyteau
-- REVIEW BEFORE APPLYING. Additive DDL only. No existing table, policy or
-- function is altered or dropped.
--
-- ---------------------------------------------------------------------
-- THE ONE RULE THAT MATTERS
-- ---------------------------------------------------------------------
-- Everything in this migration is INFORMATIONAL. It is client-reported,
-- machine-collected telemetry: a heartbeat from a browser tab that may have
-- been left open on a bus. It is NOT attendance, it is NOT contact hours, and
-- it MUST NOT reach a caseworker, funder or auditor as either.
--
-- The caseworker-verifiable record is, and remains, empowercare.attendance —
-- one staff-attested row per enrollment per day, capped at 12 contact hours,
-- with recorded_by pointing at the staff member who attested it. Nothing here
-- writes to it, aggregates into it, or is joined to it by any view or
-- function in this migration. The two live in different tables on purpose,
-- and that separation is the whole design.
--
-- Every table below carries that statement as a COMMENT ON TABLE, so it
-- travels with the schema into any dump, diagram or generated type.
--
-- Deliberate omissions:
--   * No vendor policy on either table. A vendor asking "how many hours did
--     they do" must be answered from attested attendance
--     (public.vendor_empowercare_status), never from telemetry. Handing a
--     funder an engagement number is precisely how informational hours turn
--     into billed hours.
--   * No trigger, view or function that sums engagement seconds into
--     anything called "hours attended" or "contact hours".
--   * No automatic capture. Rows arrive only when the application writes
--     them; this migration adds schema, not behaviour.
--
-- Idempotent: safe to run twice.
-- Rollback: see sql/MIGRATIONS.md (§0008).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Login / session events.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.engagement_login_event (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_id uuid        REFERENCES public.participants(id) ON DELETE SET NULL,
  event          text        NOT NULL DEFAULT 'SIGN_IN',
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  user_agent     text,
  source         text        NOT NULL DEFAULT 'web',
  CONSTRAINT engagement_login_event_kind
    CHECK (event IN ('SIGN_IN','SIGN_OUT','SESSION_PING'))
);

COMMENT ON TABLE public.engagement_login_event IS
  'INFORMATIONAL ONLY — auto-captured sign-in / sign-out telemetry. These are '
  'NOT contact hours and are NOT caseworker-verifiable. Staff must verify '
  'participation before anything reaches a caseworker or funder. The '
  'caseworker-verifiable record is empowercare.attendance, which is '
  'staff-attested and entirely separate from this table.';
COMMENT ON COLUMN public.engagement_login_event.participant_id IS
  'Denormalised for convenience; NULL for staff and vendor sessions.';

CREATE INDEX IF NOT EXISTS engagement_login_event_user_idx
  ON public.engagement_login_event (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS engagement_login_event_participant_idx
  ON public.engagement_login_event (participant_id, occurred_at DESC);

-- ---------------------------------------------------------------------
-- 2. Time in module.
--    module_key is FK'd to core.module so a segment can never be attributed
--    to a business line that does not exist. lesson_id is optional and
--    ON DELETE SET NULL: deleting a lesson must not destroy the engagement
--    record, and must not cascade into a participant's history.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.engagement_module_time (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  participant_id uuid        NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  module_key     text        NOT NULL REFERENCES core.module(key) ON UPDATE CASCADE,
  lesson_id      uuid        REFERENCES public.edu_lessons(id) ON DELETE SET NULL,
  started_at     timestamptz NOT NULL,
  ended_at       timestamptz,
  seconds        integer     NOT NULL DEFAULT 0,
  source         text        NOT NULL DEFAULT 'web',
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT engagement_module_time_window
    CHECK (ended_at IS NULL OR ended_at >= started_at),
  -- A single segment longer than 12h is a stuck tab, not study. Cap it at the
  -- source so nobody has to defend the number later. 12h also mirrors the
  -- per-day ceiling already on empowercare.attendance.contact_hours.
  CONSTRAINT engagement_module_time_seconds_sane
    CHECK (seconds >= 0 AND seconds <= 43200)
);

COMMENT ON TABLE public.engagement_module_time IS
  'INFORMATIONAL ONLY — auto-tracked time a participant had a module open. '
  'These are NOT contact hours and are NOT caseworker-verifiable. Staff must '
  'verify participation before anything reaches a caseworker or funder. The '
  'caseworker-verifiable record is empowercare.attendance, which is '
  'staff-attested and entirely separate from this table. Never sum this '
  'column into a figure presented as attendance.';
COMMENT ON COLUMN public.engagement_module_time.seconds IS
  'Elapsed seconds for one segment, capped at 43200 (12h). A stuck browser '
  'tab produces long segments; the cap keeps one from dominating a total.';

CREATE INDEX IF NOT EXISTS engagement_module_time_participant_idx
  ON public.engagement_module_time (participant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS engagement_module_time_module_idx
  ON public.engagement_module_time (module_key, started_at DESC);

-- ---------------------------------------------------------------------
-- 3. RLS.
--    Participants write and read their own telemetry. Staff read everything.
--    Nobody updates or deletes: telemetry is append-only, so a total cannot
--    be quietly edited after it has been reported.
-- ---------------------------------------------------------------------
ALTER TABLE public.engagement_login_event  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_module_time  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_login_event_own_insert ON public.engagement_login_event;
CREATE POLICY engagement_login_event_own_insert
  ON public.engagement_login_event
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS engagement_login_event_own_read ON public.engagement_login_event;
CREATE POLICY engagement_login_event_own_read
  ON public.engagement_login_event
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS engagement_login_event_staff_read ON public.engagement_login_event;
CREATE POLICY engagement_login_event_staff_read
  ON public.engagement_login_event
  FOR SELECT TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['super_admin','trainer']));

DROP POLICY IF EXISTS engagement_module_time_own_insert ON public.engagement_module_time;
CREATE POLICY engagement_module_time_own_insert
  ON public.engagement_module_time
  FOR INSERT TO authenticated
  WITH CHECK (participant_id = public.current_participant_id());

DROP POLICY IF EXISTS engagement_module_time_own_read ON public.engagement_module_time;
CREATE POLICY engagement_module_time_own_read
  ON public.engagement_module_time
  FOR SELECT TO authenticated
  USING (participant_id = public.current_participant_id());

DROP POLICY IF EXISTS engagement_module_time_staff_read ON public.engagement_module_time;
CREATE POLICY engagement_module_time_staff_read
  ON public.engagement_module_time
  FOR SELECT TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['super_admin','trainer']));

-- No UPDATE and no DELETE policy on either table, for anyone.

-- ---------------------------------------------------------------------
-- 4. Rollup for staff review — security_invoker, so the policies above are
--    what decide the rows, exactly as for every other view in this database.
--
--    The column is named engagement_hours, not hours and not contact_hours,
--    and the view name says engagement. Naming is the last line of defence
--    when someone copies a number into a report.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_engagement_hours
WITH (security_invoker = true) AS
  SELECT t.participant_id,
         t.module_key,
         count(*)                                   AS segments,
         sum(t.seconds)                             AS engagement_seconds,
         round(sum(t.seconds) / 3600.0, 2)          AS engagement_hours,
         min(t.started_at)                          AS first_seen,
         max(COALESCE(t.ended_at, t.started_at))    AS last_seen
    FROM public.engagement_module_time t
   GROUP BY t.participant_id, t.module_key;

COMMENT ON VIEW public.v_engagement_hours IS
  'INFORMATIONAL ONLY. Rollup of auto-tracked engagement time. NOT contact '
  'hours, NOT attendance, NOT caseworker-verifiable. security_invoker = true, '
  'so RLS on public.engagement_module_time governs every row.';

GRANT SELECT ON public.v_engagement_hours TO authenticated;

COMMIT;

-- =====================================================================
-- VERIFICATION (read-only) — uncomment after applying.
-- =====================================================================
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname IN ('engagement_login_event','engagement_module_time');
--   expect true on both.
--
-- SELECT relname, reloptions FROM pg_class WHERE relname = 'v_engagement_hours';
--   expect {security_invoker=true}.
--
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE tablename LIKE 'engagement%' ORDER BY 1,3,2;
--   expect only SELECT and INSERT policies. No UPDATE, no DELETE, no vendor.
--
-- SELECT obj_description('public.engagement_module_time'::regclass, 'pg_class');
--   expect the text to contain 'INFORMATIONAL ONLY' and 'NOT caseworker-verifiable'.
