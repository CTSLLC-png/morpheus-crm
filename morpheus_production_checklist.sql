-- ═══════════════════════════════════════════════════════════════
--  MORPHEUS CRM — Production Setup Checklist SQL
--  Run these in Supabase SQL Editor after schema is deployed.
--  Certified Training Standards · Albany, NY · morpheuscrm.com
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Verify all tables exist ──────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'staff_profiles','participants','cohorts','cohort_enrollments',
    'call_sessions','call_scores','score_matrix_weights','certifications'
  )
ORDER BY table_name;
-- Expected: 8 rows returned

-- ── 2. Verify views exist ───────────────────────────────────────
SELECT viewname
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN (
    'v_participant_performance',
    'v_cohort_overview',
    'v_certification_eligibility'
  );
-- Expected: 3 rows returned

-- ── 3. Verify global score weights seeded ──────────────────────
SELECT * FROM score_matrix_weights WHERE cohort_id IS NULL;
-- Expected: 1 row with weights summing to 100

-- ── 4. Verify RLS is enabled ───────────────────────────────────
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'staff_profiles','participants','cohorts','cohort_enrollments',
    'call_sessions','call_scores','score_matrix_weights','certifications'
  );
-- Expected: all rows show rowsecurity = true

-- ── 5. Verify triggers ─────────────────────────────────────────
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table;
-- Expected: trg_generate_cts_id, trg_generate_cert_number, 3× trg_touch_updated_at

-- ── 6. Create first super admin (run ONCE, then delete this) ───
-- Replace with real values before running.
-- After running, create the matching staff_profiles row below.

-- Step A: Create via Supabase Auth (use Dashboard or CLI)
-- supabase auth admin createUser \
--   --email admin@morpheuscrm.com \
--   --password YOUR_SECURE_PASSWORD \
--   --user-metadata '{"role":"super_admin","full_name":"CTS Admin"}'

-- Step B: Insert staff profile (replace USER_ID with actual auth user id)
-- INSERT INTO staff_profiles (user_id, full_name, title)
-- VALUES ('USER_ID_FROM_AUTH', 'CTS Admin', 'Program Director');

-- ── 7. Verify sequence state ───────────────────────────────────
SELECT last_value FROM cts_id_seq;
SELECT last_value FROM cert_seq;
-- Both should be 1 (unused) on a fresh database

-- ── 8. Performance indexes (confirm exist) ─────────────────────
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- ── 9. Full system health check ─────────────────────────────────
SELECT
  (SELECT count(*) FROM staff_profiles)       AS staff_count,
  (SELECT count(*) FROM participants)          AS participant_count,
  (SELECT count(*) FROM cohorts)               AS cohort_count,
  (SELECT count(*) FROM call_sessions)         AS session_count,
  (SELECT count(*) FROM call_scores)           AS score_count,
  (SELECT count(*) FROM certifications)        AS cert_count,
  (SELECT weight_opening + weight_listening + weight_empathy +
          weight_resolution + weight_policy + weight_closing
   FROM score_matrix_weights
   WHERE cohort_id IS NULL)                    AS global_weight_total;
-- global_weight_total must be 100.00
