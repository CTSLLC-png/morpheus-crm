-- =====================================================================
-- Morpheus OS — 0001_invariants.test.sql
-- pgTAP suite for the empowercare + melrah business-rule invariants.
--
-- SAFETY: the whole file runs inside BEGIN ... ROLLBACK. Nothing is
-- committed, including CREATE EXTENSION pgtap. Safe against the live DB.
--
-- ROLE: run as the table owner (postgres). Triggers fire for every role,
-- so trigger invariants do not need an impersonated JWT. RLS-scoped
-- assertions live in 0002_tenant_isolation.test.sql instead.
--
-- Sections:
--   A. empowercare.attempt immutability      (lock_submitted_attempt)
--   B. empowercare.audit append-only         (audit_append_only)
--   C. empowercare gates                     (gate_block / enforce_gate_on_attempt)
--   D. empowercare.enrollment.retain_until   (set_retain_until)
--   E. melrah lot release gate               (enforce_release_gate)
--   F. melrah append-only ledgers            (custody_append_only / qc_append_only)
--   G. melrah work-order close gate          (enforce_wo_close)
--   H. melrah account activation gate        (enforce_activation_gate)
--   Z. KNOWN-FAILING regression tests for invariants that are NOT
--      enforced today. These are wrapped in todo_start/todo_end so the
--      suite still exits clean, but each one flips to "unexpectedly
--      succeeded" the moment the underlying bug is fixed. See README.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(58);

-- ---------------------------------------------------------------------
-- Fixtures. Fixed UUIDs so failures are easy to trace. All rolled back.
-- ---------------------------------------------------------------------

-- participants (cts_id is auto-filled by public.generate_cts_id())
INSERT INTO public.participants (id, cts_id, full_name, program_source) VALUES
  ('e0000000-0000-0000-0000-000000000001','','Invariant Subject 1','Direct Enrollment'),
  ('e0000000-0000-0000-0000-000000000002','','Invariant Subject 2','Direct Enrollment'),
  ('e0000000-0000-0000-0000-000000000003','','Invariant Subject 3','Direct Enrollment'),
  ('e0000000-0000-0000-0000-000000000004','','Invariant Subject 4','Direct Enrollment'),
  ('e0000000-0000-0000-0000-000000000005','','Invariant Subject 5','Direct Enrollment'),
  ('e0000000-0000-0000-0000-000000000006','','Invariant Subject 6','Direct Enrollment'),
  ('e0000000-0000-0000-0000-000000000007','','Invariant Subject 7','Direct Enrollment'),
  ('e0000000-0000-0000-0000-000000000008','','Invariant Subject 8','Direct Enrollment');

-- a known retention policy (3-year) so retain_until maths is deterministic
INSERT INTO empowercare.retention_policy (id, name, basis, retain_years)
VALUES ('e1000000-0000-0000-0000-000000000001','TEST 3yr Policy','INTERNAL',3);

-- enrollments in the various states the gate cares about
INSERT INTO empowercare.enrollment (id, participant_id, state, enrolled_at) VALUES
  ('e2000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','WEEK_ONE_ACTIVE', '2025-01-15T00:00:00Z'),
  ('e2000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000002','WEEK_TWO_BLOCKED','2025-01-15T00:00:00Z'),
  ('e2000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000003','WEEK_TWO_ACTIVE', '2025-01-15T00:00:00Z');

-- COHORT_EXIT requires the exit_requires_counselling check to be satisfied
INSERT INTO empowercare.enrollment
  (id, participant_id, state, enrolled_at, exit_at, exit_counselled_by, exit_reenrolment_date)
VALUES
  ('e2000000-0000-0000-0000-000000000004','e0000000-0000-0000-0000-000000000004','COHORT_EXIT',
   '2025-01-15T00:00:00Z','2025-02-01T00:00:00Z','Test Counsellor','2025-09-01');

-- melrah fixtures
INSERT INTO melrah.device (id, sku, description)
VALUES ('a0000000-0000-0000-0000-000000000001','TEST-SKU-INV','Invariant test device');

INSERT INTO melrah.account (id, name, network_type, stage) VALUES
  ('a1000000-0000-0000-0000-000000000001','INV Account Base','IDN','PROSPECT'),
  ('a1000000-0000-0000-0000-000000000002','INV Account Gate','IDN','ONBOARDING'),
  ('a1000000-0000-0000-0000-000000000003','INV Account Clear','IDN','ONBOARDING');

INSERT INTO melrah.work_order (id, wo_number, account_id, wo_type, status) VALUES
  ('a2000000-0000-0000-0000-000000000001','INV-WO-1','a1000000-0000-0000-0000-000000000001','COLLECTION','RECEIVED'),
  ('a2000000-0000-0000-0000-000000000002','INV-WO-2','a1000000-0000-0000-0000-000000000001','COLLECTION','RECEIVED'),
  ('a2000000-0000-0000-0000-000000000003','INV-WO-3','a1000000-0000-0000-0000-000000000001','COLLECTION','RECEIVED');

INSERT INTO melrah.lot (id, lot_number, work_order_id, device_id, qty_received, status) VALUES
  ('a3000000-0000-0000-0000-000000000001','INV-LOT-NOQC',  'a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',10,'QUARANTINE'),
  ('a3000000-0000-0000-0000-000000000002','INV-LOT-REJECT','a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',10,'QUARANTINE'),
  ('a3000000-0000-0000-0000-000000000003','INV-LOT-SEQ',   'a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',10,'QUARANTINE'),
  ('a3000000-0000-0000-0000-000000000004','INV-LOT-NCR',   'a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',10,'QUARANTINE'),
  ('a3000000-0000-0000-0000-000000000005','INV-LOT-NCRFIX','a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',10,'QUARANTINE'),
  ('a3000000-0000-0000-0000-000000000006','INV-LOT-WOOPEN','a2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001',10,'QUARANTINE'),
  ('a3000000-0000-0000-0000-000000000007','INV-LOT-WODONE','a2000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001',10,'QUARANTINE');

INSERT INTO melrah.custody_event (id, work_order_id, event_type, actor)
VALUES (900000001,'a2000000-0000-0000-0000-000000000001','SEALED','invariant-test');


-- =====================================================================
-- A. empowercare.attempt is immutable once SUBMITTED
--    trigger trg_lock_attempt BEFORE UPDATE OR DELETE
-- =====================================================================

-- Create an attempt that the gate allows (day 1, WEEK_ONE_ACTIVE), then submit it.
INSERT INTO empowercare.attempt (id, enrollment_id, assessment_key, attempt_number, status)
VALUES ('e3000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','d1',1,'OPEN');

-- 1. an OPEN attempt is still editable (this is the transition INTO submitted)
SELECT lives_ok(
  $$ UPDATE empowercare.attempt
        SET status='SUBMITTED', pass=true, pct=0.90, submitted_at=now()
      WHERE id='e3000000-0000-0000-0000-000000000001' $$,
  'A1: an OPEN attempt can be updated (and submitted)'
);

-- 2. once SUBMITTED, any further UPDATE is refused
SELECT throws_like(
  $$ UPDATE empowercare.attempt SET pct=0.99
      WHERE id='e3000000-0000-0000-0000-000000000001' $$,
  '%is submitted and immutable%',
  'A2: UPDATE of a SUBMITTED attempt is refused by lock_submitted_attempt'
);

-- 3. ... including an attempt to walk the status back
SELECT throws_like(
  $$ UPDATE empowercare.attempt SET status='OPEN'
      WHERE id='e3000000-0000-0000-0000-000000000001' $$,
  '%is submitted and immutable%',
  'A3: a SUBMITTED attempt cannot be reopened'
);

-- 4. ... and it survives a no-op UPDATE too (trigger is unconditional on OLD.status)
SELECT throws_like(
  $$ UPDATE empowercare.attempt SET id=id
      WHERE id='e3000000-0000-0000-0000-000000000001' $$,
  '%is submitted and immutable%',
  'A4: even a no-op UPDATE of a SUBMITTED attempt is refused'
);

-- 5. DELETE is refused regardless of status
SELECT throws_like(
  $$ DELETE FROM empowercare.attempt
      WHERE id='e3000000-0000-0000-0000-000000000001' $$,
  '%Attempts cannot be deleted%',
  'A5: DELETE of an attempt is refused without the retention-purge flag'
);

-- 6. the documented escape hatch: the retention purge flag permits DELETE
SELECT set_config('empowercare.purge','on', true);
SELECT lives_ok(
  $$ DELETE FROM empowercare.attempt
      WHERE id='e3000000-0000-0000-0000-000000000001' $$,
  'A6: DELETE is permitted while empowercare.purge=on (retention purge path)'
);
SELECT set_config('empowercare.purge','off', true);

-- 7. the flag really is required — turning it off restores the lock
INSERT INTO empowercare.attempt (id, enrollment_id, assessment_key, attempt_number, status)
VALUES ('e3000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001','d1',2,'OPEN');
SELECT throws_like(
  $$ DELETE FROM empowercare.attempt
      WHERE id='e3000000-0000-0000-0000-000000000002' $$,
  '%Attempts cannot be deleted%',
  'A7: DELETE is refused again once empowercare.purge is off'
);


-- =====================================================================
-- B. empowercare.audit is append-only
--    trigger trg_audit_append_only BEFORE UPDATE OR DELETE
-- =====================================================================

INSERT INTO empowercare.audit (id, actor, action, detail)
VALUES (900000001,'invariant-test','TEST','append-only fixture');

-- 8. INSERT is the only permitted operation
SELECT lives_ok(
  $$ INSERT INTO empowercare.audit (actor, action, detail)
     VALUES ('invariant-test','TEST','second row') $$,
  'B1: INSERT into empowercare.audit is permitted'
);

-- 9. UPDATE is refused
SELECT throws_like(
  $$ UPDATE empowercare.audit SET detail='tampered' WHERE id=900000001 $$,
  '%audit log is append-only%',
  'B2: UPDATE of empowercare.audit is refused'
);

-- 10. DELETE is refused
SELECT throws_like(
  $$ DELETE FROM empowercare.audit WHERE id=900000001 $$,
  '%audit log is append-only%',
  'B3: DELETE from empowercare.audit is refused'
);

-- 11. a blanket DELETE (the thing an attacker would actually try) is refused
SELECT throws_like(
  $$ DELETE FROM empowercare.audit $$,
  '%audit log is append-only%',
  'B4: an unqualified DELETE of the whole audit log is refused'
);

-- 12. unlike empowercare.attempt, audit has NO purge escape hatch
SELECT set_config('empowercare.purge','on', true);
SELECT throws_like(
  $$ DELETE FROM empowercare.audit WHERE id=900000001 $$,
  '%audit log is append-only%',
  'B5: empowercare.purge=on does NOT unlock the audit log'
);
SELECT set_config('empowercare.purge','off', true);


-- =====================================================================
-- C. empowercare gates block progression
--    gate_block() consulted by enforce_gate_on_attempt (BEFORE INSERT)
-- =====================================================================

-- 13. Day 10 ("dx") is blocked while earlier days are not SUBMITTED+pass
SELECT throws_like(
  $$ INSERT INTO empowercare.attempt (enrollment_id, assessment_key, attempt_number, status)
     VALUES ('e2000000-0000-0000-0000-000000000001','dx',1,'OPEN') $$,
  '%GATE: Outstanding modules%',
  'C1: day-10 attempt is blocked while earlier modules are outstanding'
);

-- 14. the gate names the specific outstanding days (message is operator-facing)
SELECT throws_like(
  $$ INSERT INTO empowercare.attempt (enrollment_id, assessment_key, attempt_number, status)
     VALUES ('e2000000-0000-0000-0000-000000000001','dx',1,'OPEN') $$,
  '%Day 1, Day 2%',
  'C2: the day-10 gate message enumerates the outstanding days'
);

-- 15. WEEK_TWO_BLOCKED blocks day >= 6
SELECT throws_like(
  $$ INSERT INTO empowercare.attempt (enrollment_id, assessment_key, attempt_number, status)
     VALUES ('e2000000-0000-0000-0000-000000000002','d6',1,'OPEN') $$,
  '%Week Two blocked%',
  'C3: WEEK_TWO_BLOCKED blocks a day-6 attempt'
);

-- 16. ... but NOT day < 6 (the participant can still finish week one)
SELECT lives_ok(
  $$ INSERT INTO empowercare.attempt (enrollment_id, assessment_key, attempt_number, status)
     VALUES ('e2000000-0000-0000-0000-000000000002','d5',1,'OPEN') $$,
  'C4: WEEK_TWO_BLOCKED still permits a day-5 attempt'
);

-- 17. COHORT_EXIT blocks everything, including day 1
SELECT throws_like(
  $$ INSERT INTO empowercare.attempt (enrollment_id, assessment_key, attempt_number, status)
     VALUES ('e2000000-0000-0000-0000-000000000004','d1',1,'OPEN') $$,
  '%exited the cohort%',
  'C5: a COHORT_EXIT enrollment cannot open any attempt'
);

-- 18. an unknown assessment key is rejected by the gate, not by the FK
SELECT throws_like(
  $$ INSERT INTO empowercare.attempt (enrollment_id, assessment_key, attempt_number, status)
     VALUES ('e2000000-0000-0000-0000-000000000001','no-such-key',1,'OPEN') $$,
  '%Unknown assessment%',
  'C6: an unknown assessment_key is rejected by the gate'
);

-- 19. an unknown enrollment is rejected by the gate
SELECT throws_like(
  $$ INSERT INTO empowercare.attempt (enrollment_id, assessment_key, attempt_number, status)
     VALUES ('e2000000-0000-0000-0000-0000000000ff','d1',1,'OPEN') $$,
  '%Enrollment not found%',
  'C7: an unknown enrollment_id is rejected by the gate'
);

-- Days 8/9 are gated on the freshness of the regulatory register.
-- Force the register into a known state so this is deterministic.
UPDATE empowercare.regulatory_ref
   SET review_by = CURRENT_DATE + 365
 WHERE days && ARRAY[8,9]::smallint[];

-- 20. with every day-8/9 reference current, a day-8 attempt is allowed
SELECT lives_ok(
  $$ INSERT INTO empowercare.attempt (enrollment_id, assessment_key, attempt_number, status)
     VALUES ('e2000000-0000-0000-0000-000000000003','d8',1,'OPEN') $$,
  'C8: day-8 attempt is allowed when the day-8/9 regulatory refs are all current'
);

-- now stale one of them
UPDATE empowercare.regulatory_ref
   SET review_by = CURRENT_DATE - 1
 WHERE id = (SELECT id FROM empowercare.regulatory_ref
              WHERE days && ARRAY[8,9]::smallint[] ORDER BY id LIMIT 1);

-- 21. a single stale day-8/9 reference blocks day 8
SELECT throws_like(
  $$ INSERT INTO empowercare.attempt (enrollment_id, assessment_key, attempt_number, status)
     VALUES ('e2000000-0000-0000-0000-000000000003','d8',2,'OPEN') $$,
  '%Stale regulatory references block this day%',
  'C9: a stale day-8/9 regulatory reference blocks a day-8 attempt'
);

-- 22. ... and day 9 too
SELECT throws_like(
  $$ INSERT INTO empowercare.attempt (enrollment_id, assessment_key, attempt_number, status)
     VALUES ('e2000000-0000-0000-0000-000000000003','d9',1,'OPEN') $$,
  '%Stale regulatory references block this day%',
  'C10: a stale day-8/9 regulatory reference blocks a day-9 attempt'
);

-- 23. ... but does not block an unrelated day
SELECT lives_ok(
  $$ INSERT INTO empowercare.attempt (enrollment_id, assessment_key, attempt_number, status)
     VALUES ('e2000000-0000-0000-0000-000000000003','d7',1,'OPEN') $$,
  'C11: a stale day-8/9 reference does not block a day-7 attempt'
);

-- restore the register for the rest of the file
UPDATE empowercare.regulatory_ref
   SET review_by = CURRENT_DATE + 365
 WHERE days && ARRAY[8,9]::smallint[];

-- 24. gate_block() is a pure predicate: it returns NULL when nothing blocks
SELECT is(
  empowercare.gate_block('e2000000-0000-0000-0000-000000000001','d1'),
  NULL,
  'C12: gate_block() returns NULL when a day-1 attempt is permitted'
);


-- =====================================================================
-- D. empowercare.enrollment.retain_until is DERIVED by set_retain_until
--    trigger trg_retain_until BEFORE INSERT OR UPDATE
-- =====================================================================

-- 25. with a policy attached, retain_until = enrolled_at + retain_years
INSERT INTO empowercare.enrollment (id, participant_id, retention_policy_id, enrolled_at)
VALUES ('e2000000-0000-0000-0000-000000000005','e0000000-0000-0000-0000-000000000005',
        'e1000000-0000-0000-0000-000000000001','2025-01-15T00:00:00Z');
SELECT is(
  (SELECT retain_until FROM empowercare.enrollment WHERE id='e2000000-0000-0000-0000-000000000005'),
  DATE '2028-01-15',
  'D1: retain_until is derived from enrolled_at + policy retain_years'
);

-- 26. a hand-set retain_until is OVERWRITTEN when a policy is attached
INSERT INTO empowercare.enrollment (id, participant_id, retention_policy_id, enrolled_at, retain_until)
VALUES ('e2000000-0000-0000-0000-000000000006','e0000000-0000-0000-0000-000000000006',
        'e1000000-0000-0000-0000-000000000001','2025-01-15T00:00:00Z', DATE '1999-01-01');
SELECT is(
  (SELECT retain_until FROM empowercare.enrollment WHERE id='e2000000-0000-0000-0000-000000000006'),
  DATE '2028-01-15',
  'D2: a hand-set retain_until is overwritten by the policy on INSERT'
);

-- 27. completed_at takes precedence over enrolled_at as the retention basis
UPDATE empowercare.enrollment
   SET completed_at = '2025-06-30T00:00:00Z'
 WHERE id='e2000000-0000-0000-0000-000000000005';
SELECT is(
  (SELECT retain_until FROM empowercare.enrollment WHERE id='e2000000-0000-0000-0000-000000000005'),
  DATE '2028-06-30',
  'D3: retain_until is recomputed from completed_at once the course completes'
);

-- 28. hand-setting retain_until on UPDATE is overwritten while a policy is attached
UPDATE empowercare.enrollment
   SET retain_until = DATE '1999-01-01'
 WHERE id='e2000000-0000-0000-0000-000000000005';
SELECT is(
  (SELECT retain_until FROM empowercare.enrollment WHERE id='e2000000-0000-0000-0000-000000000005'),
  DATE '2028-06-30',
  'D4: a hand-set retain_until is overwritten by the policy on UPDATE'
);


-- =====================================================================
-- E. melrah.lot cannot reach RELEASED without a passing QC inspection
--    trigger trg_release_gate BEFORE UPDATE
-- =====================================================================

-- 29. no QC inspection at all
SELECT throws_like(
  $$ UPDATE melrah.lot SET status='RELEASED'
      WHERE id='a3000000-0000-0000-0000-000000000001' $$,
  '%no QC inspection on record%',
  'E1: QUARANTINE -> RELEASED is refused with no QC inspection'
);

-- 30. latest inspection is a REJECT
INSERT INTO melrah.qc_inspection (lot_id, sample_size, defects_found, disposition)
VALUES ('a3000000-0000-0000-0000-000000000002', 10, 4, 'REJECT');
SELECT throws_like(
  $$ UPDATE melrah.lot SET status='RELEASED'
      WHERE id='a3000000-0000-0000-0000-000000000002' $$,
  '%latest inspection disposition is REJECT%',
  'E2: release is refused when the latest QC disposition is REJECT'
);

-- 31. the gate is decided by seq, not by inspected_at.
--     Insert REJECT first (lower seq) but stamp it LATER in wall-clock time,
--     then ACCEPT (higher seq) stamped EARLIER. Highest seq must win.
INSERT INTO melrah.qc_inspection (lot_id, sample_size, defects_found, disposition, inspected_at)
VALUES ('a3000000-0000-0000-0000-000000000003', 10, 4, 'REJECT', now() + interval '1 hour');
INSERT INTO melrah.qc_inspection (lot_id, sample_size, defects_found, disposition, inspected_at)
VALUES ('a3000000-0000-0000-0000-000000000003', 10, 0, 'ACCEPT', now() - interval '1 hour');
SELECT lives_ok(
  $$ UPDATE melrah.lot SET status='RELEASED'
      WHERE id='a3000000-0000-0000-0000-000000000003' $$,
  'E3: release succeeds on the highest-seq ACCEPT even when an older-seq REJECT has a later timestamp'
);

-- 32. releasing stamps released_at
SELECT isnt(
  (SELECT released_at FROM melrah.lot WHERE id='a3000000-0000-0000-0000-000000000003'),
  NULL,
  'E4: a released lot has released_at stamped by the gate'
);

-- 33. an open CRITICAL nonconformance blocks release even with a passing QC
INSERT INTO melrah.qc_inspection (lot_id, sample_size, defects_found, disposition)
VALUES ('a3000000-0000-0000-0000-000000000004', 10, 0, 'ACCEPT');
INSERT INTO melrah.nonconformance (id, ncr_number, lot_id, severity, description, status)
VALUES ('a4000000-0000-0000-0000-000000000001','INV-NCR-1','a3000000-0000-0000-0000-000000000004',
        'CRITICAL','Invariant test critical NCR','OPEN');
SELECT throws_like(
  $$ UPDATE melrah.lot SET status='RELEASED'
      WHERE id='a3000000-0000-0000-0000-000000000004' $$,
  '%open critical nonconformance%',
  'E5: an open CRITICAL nonconformance blocks release despite a passing QC'
);

-- 34. a MINOR nonconformance does NOT block, and a CLOSED critical one does not either
INSERT INTO melrah.qc_inspection (lot_id, sample_size, defects_found, disposition)
VALUES ('a3000000-0000-0000-0000-000000000005', 10, 0, 'ACCEPT');
INSERT INTO melrah.nonconformance (id, ncr_number, lot_id, severity, description, status, closed_at)
VALUES ('a4000000-0000-0000-0000-000000000002','INV-NCR-2','a3000000-0000-0000-0000-000000000005',
        'CRITICAL','Invariant test closed NCR','CLOSED', now()),
       ('a4000000-0000-0000-0000-000000000003','INV-NCR-3','a3000000-0000-0000-0000-000000000005',
        'MINOR','Invariant test minor NCR','OPEN', NULL);
SELECT lives_ok(
  $$ UPDATE melrah.lot SET status='RELEASED'
      WHERE id='a3000000-0000-0000-0000-000000000005' $$,
  'E6: a CLOSED critical NCR and an OPEN minor NCR do not block release'
);

-- 35. non-RELEASED transitions are untouched by the gate
SELECT lives_ok(
  $$ UPDATE melrah.lot SET status='ON_HOLD'
      WHERE id='a3000000-0000-0000-0000-000000000001' $$,
  'E7: the release gate does not interfere with a QUARANTINE -> ON_HOLD move'
);


-- =====================================================================
-- F. melrah.custody_event and melrah.qc_inspection are append-only
-- =====================================================================

-- 36/37. custody_event
SELECT throws_like(
  $$ UPDATE melrah.custody_event SET note='tampered' WHERE id=900000001 $$,
  '%Chain of custody is append-only%',
  'F1: UPDATE of melrah.custody_event is refused'
);
SELECT throws_like(
  $$ DELETE FROM melrah.custody_event WHERE id=900000001 $$,
  '%Chain of custody is append-only%',
  'F2: DELETE from melrah.custody_event is refused'
);

-- 38. INSERT remains permitted
SELECT lives_ok(
  $$ INSERT INTO melrah.custody_event (work_order_id, event_type, actor)
     VALUES ('a2000000-0000-0000-0000-000000000001','PICKED_UP','invariant-test') $$,
  'F3: INSERT into melrah.custody_event is permitted'
);

-- 39/40. qc_inspection
SELECT throws_like(
  $$ UPDATE melrah.qc_inspection SET disposition='ACCEPT'
      WHERE lot_id='a3000000-0000-0000-0000-000000000002' $$,
  '%quality record and cannot be altered%',
  'F4: UPDATE of melrah.qc_inspection is refused'
);
SELECT throws_like(
  $$ DELETE FROM melrah.qc_inspection
      WHERE lot_id='a3000000-0000-0000-0000-000000000002' $$,
  '%quality record and cannot be altered%',
  'F5: DELETE from melrah.qc_inspection is refused'
);

-- 41. the documented purge escape hatch unlocks both ledgers
SELECT set_config('melrah.purge','on', true);
SELECT lives_ok(
  $$ DELETE FROM melrah.qc_inspection
      WHERE lot_id='a3000000-0000-0000-0000-000000000002' $$,
  'F6: DELETE is permitted while melrah.purge=on (account purge path)'
);
SELECT set_config('melrah.purge','off', true);

-- 42. ... and only while it is on. Note the flag is DELETE-only:
--     UPDATE is refused even during a purge.
SELECT set_config('melrah.purge','on', true);
SELECT throws_like(
  $$ UPDATE melrah.custody_event SET note='tampered' WHERE id=900000001 $$,
  '%Chain of custody is append-only%',
  'F7: melrah.purge=on unlocks DELETE but never UPDATE'
);
SELECT set_config('melrah.purge','off', true);


-- =====================================================================
-- G. melrah.enforce_wo_close blocks closing a work order with pending lots
--    trigger trg_wo_close BEFORE UPDATE
-- =====================================================================

-- 43. INV-WO-2 still has a QUARANTINE lot
SELECT throws_like(
  $$ UPDATE melrah.work_order SET status='CLOSED'
      WHERE id='a2000000-0000-0000-0000-000000000002' $$,
  '%still in quarantine, in process or on hold%',
  'G1: closing a work order with a QUARANTINE lot is refused'
);

-- 44. IN_PROCESS also blocks
UPDATE melrah.lot SET status='IN_PROCESS' WHERE id='a3000000-0000-0000-0000-000000000006';
SELECT throws_like(
  $$ UPDATE melrah.work_order SET status='CLOSED'
      WHERE id='a2000000-0000-0000-0000-000000000002' $$,
  '%still in quarantine, in process or on hold%',
  'G2: closing a work order with an IN_PROCESS lot is refused'
);

-- 45. drive INV-WO-3's lot through the proper QC path, then close cleanly
INSERT INTO melrah.qc_inspection (lot_id, sample_size, defects_found, disposition)
VALUES ('a3000000-0000-0000-0000-000000000007', 10, 0, 'ACCEPT');
UPDATE melrah.lot SET status='RELEASED' WHERE id='a3000000-0000-0000-0000-000000000007';
SELECT lives_ok(
  $$ UPDATE melrah.work_order SET status='CLOSED'
      WHERE id='a2000000-0000-0000-0000-000000000003' $$,
  'G3: a work order whose lots are all RELEASED can be closed'
);

-- 46. closing stamps closed_at
SELECT isnt(
  (SELECT closed_at FROM melrah.work_order WHERE id='a2000000-0000-0000-0000-000000000003'),
  NULL,
  'G4: closing a work order stamps closed_at'
);


-- =====================================================================
-- H. melrah.enforce_activation_gate blocks activation with open blocking steps
--    trigger trg_activation_gate BEFORE UPDATE
--    (trg_seed_onboarding AFTER INSERT seeds one task per step)
-- =====================================================================

-- 47. every account is seeded with a task per onboarding step
SELECT is(
  (SELECT count(*) FROM melrah.onboarding_task WHERE account_id='a1000000-0000-0000-0000-000000000002'),
  (SELECT count(*) FROM melrah.onboarding_step),
  'H1: seed_onboarding_tasks creates one task per onboarding step'
);

-- 48. activation is refused while blocking steps are OPEN
SELECT throws_like(
  $$ UPDATE melrah.account SET stage='ACTIVE'
      WHERE id='a1000000-0000-0000-0000-000000000002' $$,
  '%ONBOARDING GATE%blocking step(s) still open%',
  'H2: activating an account with open blocking steps is refused'
);

-- 49. clearing all but one blocking step is still not enough
UPDATE melrah.onboarding_task t
   SET status='DONE'
  FROM melrah.onboarding_step s
 WHERE s.key=t.step_key
   AND t.account_id='a1000000-0000-0000-0000-000000000002'
   AND s.blocking
   AND s.key <> 'qbr'
   AND s.sort_order > 10;
SELECT throws_like(
  $$ UPDATE melrah.account SET stage='ACTIVE'
      WHERE id='a1000000-0000-0000-0000-000000000002' $$,
  '%1 blocking step(s) still open%',
  'H3: a single remaining open blocking step still refuses activation'
);

-- 50. DONE or WAIVED both satisfy the gate; non-blocking steps may stay OPEN
UPDATE melrah.onboarding_task t
   SET status = CASE WHEN t.step_key='nda' THEN 'WAIVED' ELSE 'DONE' END
  FROM melrah.onboarding_step s
 WHERE s.key=t.step_key
   AND t.account_id='a1000000-0000-0000-0000-000000000003'
   AND s.blocking;
SELECT lives_ok(
  $$ UPDATE melrah.account SET stage='ACTIVE'
      WHERE id='a1000000-0000-0000-0000-000000000003' $$,
  'H4: activation succeeds when every blocking step is DONE or WAIVED (non-blocking may stay OPEN)'
);

-- 51. the non-blocking step really was left open — proving H4 was not vacuous
SELECT is(
  (SELECT count(*) FROM melrah.onboarding_task t JOIN melrah.onboarding_step s ON s.key=t.step_key
    WHERE t.account_id='a1000000-0000-0000-0000-000000000003' AND NOT s.blocking AND t.status='OPEN'),
  1::bigint,
  'H5: a non-blocking step was still OPEN when activation succeeded'
);


-- =====================================================================
-- Z. KNOWN-FAILING — invariants that the database does NOT enforce.
--
-- Every assertion below states the invariant as it SHOULD hold. They are
-- wrapped in todo_start/todo_end because they currently fail. When a fix
-- lands, pgTAP reports them as "unexpectedly succeeded" — that is the
-- signal to delete the todo wrapper. Do NOT relax these into assertions
-- of the current (broken) behaviour.
--
-- Root cause for Z1-Z3: trg_release_gate, trg_wo_close and
-- trg_activation_gate are BEFORE UPDATE only, so an INSERT that lands
-- directly on the terminal status never consults the gate.
-- Root cause for Z4-Z5: set_retain_until returns early when
-- retention_policy_id IS NULL, leaving retain_until fully client-writable.
-- Root cause for Z6: trg_enforce_gate is BEFORE INSERT only, so
-- assessment_key can be rewritten on an OPEN row after the gate ran.
-- =====================================================================

SELECT todo_start('known unenforced invariants — see README "Unenforced invariants"');

-- Z1: lot INSERTed straight to RELEASED bypasses the QC gate entirely
SELECT throws_ok(
  $$ INSERT INTO melrah.lot (id, lot_number, work_order_id, device_id, qty_received, status)
     VALUES ('a3000000-0000-0000-0000-0000000000f1','INV-LOT-Z1',
             'a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',10,'RELEASED') $$,
  'P0001', NULL,
  'Z1: a lot INSERTed directly as RELEASED must still be refused without a passing QC inspection'
);

-- Z2: work_order INSERTed straight to CLOSED bypasses the close gate
SELECT throws_ok(
  $$ INSERT INTO melrah.work_order (id, wo_number, account_id, wo_type, status)
     VALUES ('a2000000-0000-0000-0000-0000000000f2','INV-WO-Z2',
             'a1000000-0000-0000-0000-000000000001','COLLECTION','CLOSED') $$,
  'P0001', NULL,
  'Z2: a work order INSERTed directly as CLOSED must still be gated on its lots'
);

-- Z3: account INSERTed straight to ACTIVE bypasses the onboarding gate
SELECT throws_ok(
  $$ INSERT INTO melrah.account (id, name, network_type, stage)
     VALUES ('a1000000-0000-0000-0000-0000000000f3','INV Account Z3','IDN','ACTIVE') $$,
  'P0001', NULL,
  'Z3: an account INSERTed directly as ACTIVE must still be gated on blocking onboarding steps'
);

-- Z4: retain_until is client-writable when no retention policy is attached
INSERT INTO empowercare.enrollment (id, participant_id, enrolled_at, retain_until)
VALUES ('e2000000-0000-0000-0000-0000000000f4','e0000000-0000-0000-0000-000000000007',
        '2025-01-15T00:00:00Z', DATE '1999-01-01');
SELECT isnt(
  (SELECT retain_until FROM empowercare.enrollment WHERE id='e2000000-0000-0000-0000-0000000000f4'),
  DATE '1999-01-01',
  'Z4: retain_until must not be hand-settable when retention_policy_id IS NULL'
);

-- Z5: detaching the policy on UPDATE lets a caller back-date retain_until,
--     which makes the row eligible for empowercare.purge_expired() — that
--     function hard-DELETEs attempts under the purge flag. This is the
--     highest-consequence gap in the file.
INSERT INTO empowercare.enrollment (id, participant_id, retention_policy_id, enrolled_at)
VALUES ('e2000000-0000-0000-0000-0000000000f5','e0000000-0000-0000-0000-000000000008',
        'e1000000-0000-0000-0000-000000000001','2025-01-15T00:00:00Z');
UPDATE empowercare.enrollment
   SET retention_policy_id = NULL, retain_until = DATE '1999-01-01'
 WHERE id='e2000000-0000-0000-0000-0000000000f5';
SELECT isnt(
  (SELECT retain_until FROM empowercare.enrollment WHERE id='e2000000-0000-0000-0000-0000000000f5'),
  DATE '1999-01-01',
  'Z5: clearing retention_policy_id on UPDATE must not let retain_until be back-dated'
);

-- Z6: the assessment gate can be walked around by INSERTing a permitted
--     assessment and then rewriting assessment_key while the row is OPEN.
INSERT INTO empowercare.attempt (id, enrollment_id, assessment_key, attempt_number, status)
VALUES ('e3000000-0000-0000-0000-0000000000f6','e2000000-0000-0000-0000-000000000001','d2',1,'OPEN');
UPDATE empowercare.attempt SET assessment_key='dx'
 WHERE id='e3000000-0000-0000-0000-0000000000f6';
SELECT isnt(
  (SELECT assessment_key FROM empowercare.attempt WHERE id='e3000000-0000-0000-0000-0000000000f6'),
  'dx',
  'Z6: an OPEN attempt must not be re-pointed at a gated assessment via UPDATE'
);

-- Z7: enforce_gate_on_attempt writes a BLOCKED audit row and then RAISEs in
--     the same transaction, so the audit row is rolled back with the reject.
--     Blocked attempts therefore leave no trace in the audit log.
SELECT is(
  (SELECT count(*) FROM empowercare.audit
    WHERE action='BLOCKED' AND ref='e2000000-0000-0000-0000-000000000004'),
  1::bigint,
  'Z7: a gate rejection must leave a BLOCKED row in the audit log'
);

SELECT todo_end();


SELECT * FROM finish();

ROLLBACK;
