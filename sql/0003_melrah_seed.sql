-- =====================================================================
-- 0003_melrah_seed.sql
-- Melrah Environmental (Morpheus OS) — demo / reference seed data
--
-- Tenant : melrah  = 1541bcd7-6955-47ca-8aa3-5d27f9d078f1
-- Project: ymavrmekxiwdphdyteau
--
-- REVIEW BEFORE APPLYING. This script is data-only (no DDL).
--
-- Conventions
--   * Every row this script creates is marked 'DEMO' in a natural-key or
--     text column:  device.sku LIKE 'DEMO-%', account.name LIKE 'DEMO — %',
--     facility.name LIKE 'DEMO — %', work_order.wo_number LIKE 'DEMO-WO-%',
--     lot.lot_number LIKE 'DEMO-LOT-%', nonconformance.ncr_number LIKE
--     'DEMO-NCR-%', qc_inspection.notes LIKE 'DEMO — %',
--     custody_event.note LIKE 'DEMO — %'.
--     onboarding_task rows are created automatically by the
--     melrah.seed_onboarding_tasks() trigger and hang off the demo accounts.
--   * Re-runnable: every INSERT is guarded by ON CONFLICT DO NOTHING or a
--     NOT EXISTS predicate; every UPDATE is guarded so a second run is a
--     no-op.
--   * A matching, commented-out purge script is at the bottom.
--
-- Trigger-enforced invariants this script deliberately respects
--   * melrah.enforce_release_gate (BEFORE UPDATE ON lot): a lot may only
--     transition to RELEASED if the highest-seq qc_inspection for that lot
--     has disposition 'ACCEPT' and the lot has no open CRITICAL NCR. The
--     trigger sets released_at itself. => lots are INSERTed as QUARANTINE,
--     inspected, and only then UPDATEd to RELEASED.
--   * melrah.enforce_wo_close (BEFORE UPDATE ON work_order): a WO may only
--     move to CLOSED when it has no lot in QUARANTINE / IN_PROCESS /
--     ON_HOLD. The trigger sets closed_at itself. => the closed demo WO is
--     INSERTed as RECEIVED and UPDATEd to CLOSED after its lot is released.
--   * melrah.enforce_activation_gate (BEFORE UPDATE ON account): stage may
--     only become ACTIVE when every blocking onboarding_step has a task in
--     ('DONE','WAIVED'). => the active demo account is INSERTed as
--     ONBOARDING, its 8 blocking tasks are completed, then it is UPDATEd.
--   * melrah.custody_append_only / melrah.qc_append_only: UPDATE and DELETE
--     are rejected unless the session GUC melrah.purge = 'on'. This script
--     never updates or deletes those tables; the purge block sets the GUC.
--
-- NOTE ON RLS: all melrah tables have RLS enabled with policy
--   core.member_of(core.tenant_id('melrah')) for role `authenticated`.
--   RLS is not FORCEd, so apply this as the table owner (postgres / the
--   Supabase SQL editor or a service role). Applying it as `authenticated`
--   requires the running user to be a melrah tenant member.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Guard: the tenant must exist and match the id we hard-code below.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM core.tenant
     WHERE id = '1541bcd7-6955-47ca-8aa3-5d27f9d078f1'::uuid
  ) THEN
    RAISE EXCEPTION 'melrah tenant 1541bcd7-6955-47ca-8aa3-5d27f9d078f1 not found';
  END IF;
END $$;


-- =====================================================================
-- 1. DEVICE — reprocessable single-use device catalogue (12 rows)
--    melrah.device has NO tenant_id column; it is a shared catalogue
--    scoped only by the RLS policy.
--    K-numbers below are format-plausible demo values, not real clearances.
-- =====================================================================
INSERT INTO melrah.device
  (sku, description, oem, category, reprocessable, fda_clearance, max_cycles, active)
VALUES
  ('DEMO-SPO2-ADT-01', 'DEMO — Pulse oximeter sensor, adult finger clip, 1 m cable',
     'Nellcor / Medtronic',      'Patient Monitoring',   true,  'K182204', 5, true),
  ('DEMO-SPO2-PED-02', 'DEMO — Pulse oximeter sensor, pediatric adhesive wrap',
     'Masimo',                   'Patient Monitoring',   true,  'K192871', 5, true),
  ('DEMO-ECG-LEAD-03', 'DEMO — 5-lead ECG trunk cable and leadwire set, snap',
     'GE Healthcare',            'Patient Monitoring',   true,  'K170338', 6, true),
  ('DEMO-DVT-SLV-10',  'DEMO — Sequential compression sleeve, knee length, standard',
     'Cardinal Health (Kendall SCD)', 'DVT Prophylaxis', true,  'K173355', 3, true),
  ('DEMO-DVT-FTC-11',  'DEMO — Intermittent compression foot cuff, universal',
     'Arjo Huntleigh',           'DVT Prophylaxis',      true,  'K160988', 3, true),
  ('DEMO-EP-CBL-20',   'DEMO — Electrophysiology diagnostic cable, 10-pin, 3 m',
     'Biosense Webster',         'Electrophysiology',    true,  'K171442', 2, true),
  ('DEMO-EP-CATH-21',  'DEMO — Fixed-curve diagnostic EP catheter, decapolar 6 Fr',
     'Abbott (St. Jude Medical)','Electrophysiology',    true,  'K190517', 2, true),
  ('DEMO-LAP-SCS-30',  'DEMO — Laparoscopic scissors, 5 mm x 33 cm, monopolar',
     'Medtronic (Covidien)',     'Laparoscopy',          true,  'K163902', 4, true),
  ('DEMO-LAP-TRO-31',  'DEMO — Bladeless optical trocar with cannula, 12 mm',
     'Ethicon',                  'Laparoscopy',          true,  'K152288', 3, true),
  ('DEMO-US-ICE-40',   'DEMO — Intracardiac echo (ICE) ultrasound catheter, 8 Fr',
     'Siemens Acuson',           'Diagnostic Imaging',   true,  'K184411', 1, true),
  ('DEMO-ORTH-SHV-50', 'DEMO — Arthroscopic shaver blade, 4.2 mm aggressive cut',
     'Smith+Nephew',             'Orthopedics',          true,  'K176620', 2, true),
  ('DEMO-ESU-PEN-90',  'DEMO — Electrosurgical pencil, hand control (NOT reprocessable)',
     'Bovie Medical',            'Electrosurgery',       false, NULL,   NULL, true)
ON CONFLICT (sku) DO NOTHING;


-- =====================================================================
-- 2. ACCOUNT — two demo health systems.
--    Both are INSERTed at stage 'ONBOARDING'. The AFTER INSERT trigger
--    melrah.seed_onboarding_tasks() auto-creates one onboarding_task per
--    onboarding_step (9 rows per account, status OPEN).
--    Account A is activated later in section 6 through the proper gate.
--    Account B is left mid-onboarding on purpose, to demo the gate.
-- =====================================================================
INSERT INTO melrah.account
  (tenant_id, name, network_type, stage, region, est_annual_volume, notes)
VALUES
  ('1541bcd7-6955-47ca-8aa3-5d27f9d078f1',
   'DEMO — Cascade Valley Health Partners', 'IDN', 'ONBOARDING',
   'Pacific Northwest', 48000,
   'DEMO SEED — 3-hospital IDN, reprocessing agreement signed Q1 FY26. Purge with the block at the bottom of 0003_melrah_seed.sql.'),
  ('1541bcd7-6955-47ca-8aa3-5d27f9d078f1',
   'DEMO — Lone Star Baptist Health', 'HEALTH_SYSTEM', 'ONBOARDING',
   'South Central', 26000,
   'DEMO SEED — mid-onboarding, first pickup not yet reconciled. Purge with the block at the bottom of 0003_melrah_seed.sql.')
ON CONFLICT (tenant_id, name) DO NOTHING;


-- =====================================================================
-- 3. FACILITY — 3 for Cascade Valley, 2 for Lone Star.
--    melrah.facility has no unique constraint, so guard with NOT EXISTS.
-- =====================================================================
INSERT INTO melrah.facility
  (account_id, name, address, city, state, postal_code,
   contact_name, contact_email, contact_phone, collection_frequency, active)
SELECT a.id, v.fac_name, v.address, v.city, v.state, v.postal_code,
       v.contact_name, v.contact_email, v.contact_phone, v.collection_frequency, true
FROM (VALUES
  ('DEMO — Cascade Valley Health Partners', 'DEMO — Cascade Valley Medical Center',
     '501 N Graham St',      'Portland',   'OR', '97227',
     'Dana Whitfield, RN',   'dwhitfield@demo-cascadevalley.example',  '503-555-0142', 'WEEKLY'),
  ('DEMO — Cascade Valley Health Partners', 'DEMO — Riverbend Surgical Pavilion',
     '3333 RiverBend Dr',    'Springfield','OR', '97477',
     'Marcus Oyelaran',      'moyelaran@demo-cascadevalley.example',   '541-555-0119', 'BIWEEKLY'),
  ('DEMO — Cascade Valley Health Partners', 'DEMO — Puget Sound Ambulatory Center',
     '1560 N 115th St',      'Seattle',    'WA', '98133',
     'Priya Raghunathan',    'praghunathan@demo-cascadevalley.example','206-555-0188', 'MONTHLY'),
  ('DEMO — Lone Star Baptist Health',       'DEMO — Lone Star Baptist Medical Center',
     '3500 Gaston Ave',      'Dallas',     'TX', '75246',
     'Reggie Alvarado',      'ralvarado@demo-lonestarbaptist.example', '214-555-0170', 'WEEKLY'),
  ('DEMO — Lone Star Baptist Health',       'DEMO — North Austin Heart Institute',
     '12221 N MoPac Expy',   'Austin',     'TX', '78758',
     'Hannah Beaumont, CST', 'hbeaumont@demo-lonestarbaptist.example', '512-555-0126', 'ON_CALL')
) AS v(acct_name, fac_name, address, city, state, postal_code,
       contact_name, contact_email, contact_phone, collection_frequency)
JOIN melrah.account a
  ON a.name = v.acct_name
 AND a.tenant_id = '1541bcd7-6955-47ca-8aa3-5d27f9d078f1'
WHERE NOT EXISTS (
  SELECT 1 FROM melrah.facility f
   WHERE f.account_id = a.id AND f.name = v.fac_name
);


-- =====================================================================
-- 4. WORK ORDER — 6 orders across the lifecycle.
--    DEMO-WO-1001 is inserted as RECEIVED and closed in section 8 via the
--    enforce_wo_close gate (which also stamps closed_at).
--    No WO is inserted directly as CLOSED.
-- =====================================================================
INSERT INTO melrah.work_order
  (tenant_id, wo_number, account_id, facility_id, wo_type, status, scheduled_for, route)
SELECT '1541bcd7-6955-47ca-8aa3-5d27f9d078f1',
       v.wo_number, a.id, f.id, v.wo_type, v.status, v.scheduled_for::date, v.route
FROM (VALUES
  ('DEMO-WO-1001', 'DEMO — Cascade Valley Health Partners',
     'DEMO — Cascade Valley Medical Center', 'COLLECTION', 'RECEIVED',   '2026-07-13', 'PNW-01 Portland Metro'),
  ('DEMO-WO-1002', 'DEMO — Cascade Valley Health Partners',
     'DEMO — Riverbend Surgical Pavilion',   'COLLECTION', 'RECEIVED',   '2026-08-03', 'PNW-02 Willamette Valley'),
  ('DEMO-WO-1003', 'DEMO — Cascade Valley Health Partners',
     'DEMO — Puget Sound Ambulatory Center', 'COLLECTION', 'IN_TRANSIT', '2026-08-14', 'PNW-04 Puget Sound'),
  ('DEMO-WO-1004', 'DEMO — Cascade Valley Health Partners',
     'DEMO — Cascade Valley Medical Center', 'SWAP',       'DRAFT',      '2026-08-24', 'PNW-01 Portland Metro'),
  ('DEMO-WO-1005', 'DEMO — Lone Star Baptist Health',
     'DEMO — Lone Star Baptist Medical Center','COLLECTION','RELEASED',  '2026-08-19', 'TX-07 DFW North'),
  ('DEMO-WO-1006', 'DEMO — Lone Star Baptist Health',
     'DEMO — North Austin Heart Institute',  'AUDIT',      'CANCELLED',  '2026-07-28', 'TX-11 Central Texas')
) AS v(wo_number, acct_name, fac_name, wo_type, status, scheduled_for, route)
JOIN melrah.account a
  ON a.name = v.acct_name
 AND a.tenant_id = '1541bcd7-6955-47ca-8aa3-5d27f9d078f1'
JOIN melrah.facility f
  ON f.account_id = a.id AND f.name = v.fac_name
ON CONFLICT (wo_number) DO NOTHING;


-- ---------------------------------------------------------------------
-- 4b. WORK ORDER LINE — expected vs received quantities.
--     No unique constraint on (work_order_id, device_id): NOT EXISTS guard.
-- ---------------------------------------------------------------------
INSERT INTO melrah.work_order_line
  (work_order_id, device_id, expected_qty, received_qty)
SELECT w.id, d.id, v.expected_qty, v.received_qty
FROM (VALUES
  ('DEMO-WO-1001', 'DEMO-SPO2-ADT-01',  250, 240::int),
  ('DEMO-WO-1001', 'DEMO-ECG-LEAD-03',   60,  58),
  ('DEMO-WO-1002', 'DEMO-DVT-SLV-10',   200, 180),
  ('DEMO-WO-1002', 'DEMO-EP-CBL-20',     50,  45),
  ('DEMO-WO-1002', 'DEMO-LAP-SCS-30',   100,  96),
  ('DEMO-WO-1002', 'DEMO-US-ICE-40',     36,  30),
  ('DEMO-WO-1003', 'DEMO-SPO2-PED-02',   90, NULL),
  ('DEMO-WO-1003', 'DEMO-DVT-FTC-11',   120, NULL),
  ('DEMO-WO-1004', 'DEMO-LAP-TRO-31',    75, NULL),
  ('DEMO-WO-1005', 'DEMO-ORTH-SHV-50',   40, NULL),
  ('DEMO-WO-1005', 'DEMO-EP-CATH-21',    25, NULL),
  ('DEMO-WO-1006', 'DEMO-SPO2-ADT-01',   30, NULL)
) AS v(wo_number, sku, expected_qty, received_qty)
JOIN melrah.work_order w ON w.wo_number = v.wo_number
JOIN melrah.device      d ON d.sku       = v.sku
WHERE NOT EXISTS (
  SELECT 1 FROM melrah.work_order_line wl
   WHERE wl.work_order_id = w.id AND wl.device_id = d.id
);


-- =====================================================================
-- 5. CUSTODY EVENT — coherent chain of custody per work order.
--    Append-only table: never UPDATEd or DELETEd here.
--    Guarded on (work_order_id, event_type, occurred_at).
-- =====================================================================
INSERT INTO melrah.custody_event
  (work_order_id, event_type, occurred_at, actor, location, seal_number, note)
SELECT w.id, v.event_type, v.occurred_at::timestamptz,
       v.actor, v.location, v.seal_number, v.note
FROM (VALUES
  -- WO-1001: complete, clean chain ending in VERIFIED
  ('DEMO-WO-1001','SEALED',    '2026-07-13 07:20-07','d.whitfield@demo-cascadevalley.example','Cascade Valley Medical Center — SPD','SEAL-PNW-441201','DEMO — 2 totes sealed at dock, counts witnessed by SPD lead'),
  ('DEMO-WO-1001','PICKED_UP', '2026-07-13 09:05-07','t.nakamura@melrah.example','Cascade Valley Medical Center — Dock 3','SEAL-PNW-441201','DEMO — Route PNW-01, driver badge 2214'),
  ('DEMO-WO-1001','IN_TRANSIT','2026-07-13 12:40-07','t.nakamura@melrah.example','I-5 N / Kelso WA transfer point','SEAL-PNW-441201','DEMO — Temp log nominal'),
  ('DEMO-WO-1001','DELIVERED', '2026-07-13 16:55-07','t.nakamura@melrah.example','Melrah Reprocessing — Tukwila WA','SEAL-PNW-441201','DEMO — Seal intact at delivery'),
  ('DEMO-WO-1001','RECEIVED',  '2026-07-14 08:10-07','r.okonkwo@melrah.example','Melrah Reprocessing — Receiving Bay 1','SEAL-PNW-441201','DEMO — Seal cut, lot DEMO-LOT-26-0001 created'),
  ('DEMO-WO-1001','VERIFIED',  '2026-07-14 10:45-07','k.ahmadi@melrah.example','Melrah Reprocessing — Quarantine Cage A','SEAL-PNW-441201','DEMO — Count reconciled to manifest, 240 of 250 expected'),
  -- WO-1002: received with a documented discrepancy (EXCEPTION)
  ('DEMO-WO-1002','SEALED',    '2026-08-03 06:50-07','m.oyelaran@demo-cascadevalley.example','Riverbend Surgical Pavilion — SPD','SEAL-PNW-441288','DEMO — 4 totes sealed'),
  ('DEMO-WO-1002','PICKED_UP', '2026-08-03 08:30-07','t.nakamura@melrah.example','Riverbend Surgical Pavilion — Dock 1','SEAL-PNW-441288','DEMO — Route PNW-02'),
  ('DEMO-WO-1002','IN_TRANSIT','2026-08-03 13:15-07','t.nakamura@melrah.example','I-5 N / Salem OR','SEAL-PNW-441288','DEMO — In transit'),
  ('DEMO-WO-1002','DELIVERED', '2026-08-03 18:20-07','t.nakamura@melrah.example','Melrah Reprocessing — Tukwila WA','SEAL-PNW-441288','DEMO — Delivered after hours, held in secure cage overnight'),
  ('DEMO-WO-1002','RECEIVED',  '2026-08-04 07:35-07','r.okonkwo@melrah.example','Melrah Reprocessing — Receiving Bay 2','SEAL-PNW-441288','DEMO — 4 lots created, all to quarantine'),
  ('DEMO-WO-1002','EXCEPTION', '2026-08-04 09:12-07','r.okonkwo@melrah.example','Melrah Reprocessing — Receiving Bay 2','SEAL-PNW-441288','DEMO — 6 of 36 ICE catheters short vs manifest; discrepancy report DR-2026-0114 raised with facility'),
  -- WO-1003: en route, chain still open
  ('DEMO-WO-1003','SEALED',    '2026-08-14 07:05-07','p.raghunathan@demo-cascadevalley.example','Puget Sound Ambulatory Center — SPD','SEAL-PNW-441317','DEMO — 2 totes sealed'),
  ('DEMO-WO-1003','PICKED_UP', '2026-08-14 08:40-07','l.beaudry@melrah.example','Puget Sound Ambulatory Center — Loading dock','SEAL-PNW-441317','DEMO — Route PNW-04'),
  ('DEMO-WO-1003','IN_TRANSIT','2026-08-14 11:00-07','l.beaudry@melrah.example','SR-99 S / Shoreline WA','SEAL-PNW-441317','DEMO — ETA same day'),
  -- WO-1005: released to the field, sealed at origin only
  ('DEMO-WO-1005','SEALED',    '2026-08-17 06:45-05','r.alvarado@demo-lonestarbaptist.example','Lone Star Baptist Medical Center — SPD','SEAL-TX-880455','DEMO — Released in weekly batch, awaiting driver')
) AS v(wo_number, event_type, occurred_at, actor, location, seal_number, note)
JOIN melrah.work_order w ON w.wo_number = v.wo_number
WHERE NOT EXISTS (
  SELECT 1 FROM melrah.custody_event c
   WHERE c.work_order_id = w.id
     AND c.event_type    = v.event_type
     AND c.occurred_at   = v.occurred_at::timestamptz
);


-- =====================================================================
-- 6. LOT — always INSERTed at the QUARANTINE default. Status is only
--    changed later, after QC, so enforce_release_gate is honoured.
-- =====================================================================
INSERT INTO melrah.lot
  (tenant_id, lot_number, work_order_id, device_id, qty_received, cycle_number, status, received_at)
SELECT '1541bcd7-6955-47ca-8aa3-5d27f9d078f1',
       v.lot_number, w.id, d.id, v.qty_received, v.cycle_number::smallint,
       'QUARANTINE', v.received_at::timestamptz
FROM (VALUES
  ('DEMO-LOT-26-0001','DEMO-WO-1001','DEMO-SPO2-ADT-01', 240, 2, '2026-07-14 08:30-07'),
  ('DEMO-LOT-26-0002','DEMO-WO-1002','DEMO-DVT-SLV-10',  180, 1, '2026-08-04 07:50-07'),
  ('DEMO-LOT-26-0003','DEMO-WO-1002','DEMO-EP-CBL-20',    45, 1, '2026-08-04 07:55-07'),
  ('DEMO-LOT-26-0004','DEMO-WO-1002','DEMO-LAP-SCS-30',   96, 3, '2026-08-04 08:05-07'),
  ('DEMO-LOT-26-0005','DEMO-WO-1002','DEMO-US-ICE-40',    30, 1, '2026-08-04 08:15-07')
) AS v(lot_number, wo_number, sku, qty_received, cycle_number, received_at)
JOIN melrah.work_order w ON w.wo_number = v.wo_number
JOIN melrah.device      d ON d.sku       = v.sku
ON CONFLICT (lot_number) DO NOTHING;


-- =====================================================================
-- 7. QC INSPECTION — append-only quality record. One inspection per lot
--    where an inspection has happened. NOT EXISTS guard on lot_id keeps
--    re-runs from stacking duplicate records (they could never be undone).
--    enforce_release_gate reads the HIGHEST seq row, so ordering here
--    matters only in that we insert exactly one row per lot.
-- =====================================================================
INSERT INTO melrah.qc_inspection
  (lot_id, inspected_at, inspector_name, sample_size, defects_found, disposition, notes)
SELECT l.id, v.inspected_at::timestamptz, v.inspector_name,
       v.sample_size, v.defects_found, v.disposition, v.notes
FROM (VALUES
  ('DEMO-LOT-26-0001','2026-07-15 11:20-07','Kian Ahmadi, QC II',      32, 1, 'ACCEPT',
     'DEMO — AQL 1.0 sample per SOP-QC-014. 1 cosmetic cable-jacket scuff, functional test pass, electrical safety pass. Lot accepted for release.'),
  ('DEMO-LOT-26-0004','2026-08-06 09:40-07','Marisol Renteria, QC I',  20, 3, 'REWORK',
     'DEMO — 3 units with insulation abrasion at the jaw hinge. Routed to rework cell; NCR raised. Lot held.'),
  ('DEMO-LOT-26-0005','2026-08-06 14:05-07','Kian Ahmadi, QC II',       8, 6, 'REJECT',
     'DEMO — 6 of 8 sampled ICE catheters show lumen occlusion and shaft kinking; device max_cycles is 1 and cycle history could not be verified. Lot rejected.')
) AS v(lot_number, inspected_at, inspector_name, sample_size, defects_found, disposition, notes)
JOIN melrah.lot l ON l.lot_number = v.lot_number
WHERE NOT EXISTS (
  SELECT 1 FROM melrah.qc_inspection q WHERE q.lot_id = l.id
);


-- =====================================================================
-- 8. NONCONFORMANCE — raised against inspected lots.
--    NOTE: the CRITICAL NCR is attached to DEMO-LOT-26-0005 only.
--    DEMO-LOT-26-0001 must stay free of open critical NCRs or the
--    release gate in section 9 will (correctly) refuse it.
-- =====================================================================
INSERT INTO melrah.nonconformance
  (ncr_number, lot_id, work_order_id, raised_at, raised_by, severity, description, capa_ref, status)
SELECT v.ncr_number, l.id, w.id, v.raised_at::timestamptz, v.raised_by,
       v.severity, v.description, v.capa_ref, v.status
FROM (VALUES
  ('DEMO-NCR-2026-0031','DEMO-LOT-26-0004','DEMO-WO-1002','2026-08-06 10:15-07',
     'Marisol Renteria, QC I','MAJOR',
     'DEMO — Insulation abrasion at jaw hinge on 3 of 20 sampled laparoscopic scissors (DEMO-LAP-SCS-30). Suspected cause: facility pre-cleaning with abrasive pad contrary to in-service instruction. Lot placed ON_HOLD pending rework and 100% dielectric test.',
     'CAPA-2026-018','INVESTIGATING'),
  ('DEMO-NCR-2026-0032','DEMO-LOT-26-0005','DEMO-WO-1002','2026-08-06 14:30-07',
     'Kian Ahmadi, QC II','CRITICAL',
     'DEMO — Intracardiac echo catheters (DEMO-US-ICE-40) received without verifiable cycle history and showing lumen occlusion. Device is single-cycle. Lot rejected in full and quarantined for scrap; supplier notification and facility retraining pending.',
     'CAPA-2026-019','OPEN')
) AS v(ncr_number, lot_number, wo_number, raised_at, raised_by, severity, description, capa_ref, status)
JOIN melrah.lot        l ON l.lot_number = v.lot_number
JOIN melrah.work_order w ON w.wo_number  = v.wo_number
ON CONFLICT (ncr_number) DO NOTHING;


-- =====================================================================
-- 9. LOT STATUS TRANSITIONS — done as UPDATEs so every trigger fires.
-- =====================================================================

-- 9a. DEMO-LOT-26-0001 -> RELEASED.
--     Passes enforce_release_gate: latest (and only) qc_inspection is
--     ACCEPT and there are no open CRITICAL NCRs on this lot.
--     released_at is stamped by the trigger; do not set it here.
UPDATE melrah.lot
   SET status = 'RELEASED',
       qty_released = 232
 WHERE lot_number = 'DEMO-LOT-26-0001'
   AND status <> 'RELEASED';

-- 9b. DEMO-LOT-26-0004 -> ON_HOLD (REWORK disposition + open MAJOR NCR).
UPDATE melrah.lot
   SET status = 'ON_HOLD'
 WHERE lot_number = 'DEMO-LOT-26-0004'
   AND status <> 'ON_HOLD';

-- 9c. DEMO-LOT-26-0005 -> REJECTED (REJECT disposition + open CRITICAL NCR).
UPDATE melrah.lot
   SET status = 'REJECTED',
       qty_released = 0
 WHERE lot_number = 'DEMO-LOT-26-0005'
   AND status <> 'REJECTED';

-- 9d. DEMO-LOT-26-0002 / -0003 intentionally left in QUARANTINE, awaiting QC.


-- =====================================================================
-- 10. WORK ORDER CLOSURE — DEMO-WO-1001 -> CLOSED.
--     Its only lot (DEMO-LOT-26-0001) is RELEASED, so enforce_wo_close
--     is satisfied. The trigger stamps closed_at; do not set it here.
--     DEMO-WO-1002 is deliberately left RECEIVED: it still has lots in
--     QUARANTINE and ON_HOLD, so closing it would (correctly) raise.
-- =====================================================================
UPDATE melrah.work_order
   SET status = 'CLOSED'
 WHERE wo_number = 'DEMO-WO-1001'
   AND status <> 'CLOSED';


-- =====================================================================
-- 11. ONBOARDING — the tasks themselves were auto-created by
--     melrah.seed_onboarding_tasks() when the accounts were inserted
--     (9 tasks per account, all OPEN). Here we complete them.
-- =====================================================================

-- 11a. Cascade Valley: complete all 8 blocking steps, waive the QBR step.
UPDATE melrah.onboarding_task t
   SET status       = 'DONE',
       completed_at = timestamptz '2026-07-01 12:00-07',
       note         = 'DEMO — completed during implementation'
  FROM melrah.account a, melrah.onboarding_step s
 WHERE t.account_id = a.id
   AND a.name = 'DEMO — Cascade Valley Health Partners'
   AND a.tenant_id = '1541bcd7-6955-47ca-8aa3-5d27f9d078f1'
   AND s.key = t.step_key
   AND s.blocking
   AND t.status <> 'DONE';

UPDATE melrah.onboarding_task t
   SET status = 'WAIVED',
        note  = 'DEMO — QBR deferred to FY27 Q1 at account request'
  FROM melrah.account a
 WHERE t.account_id = a.id
   AND a.name = 'DEMO — Cascade Valley Health Partners'
   AND a.tenant_id = '1541bcd7-6955-47ca-8aa3-5d27f9d078f1'
   AND t.step_key = 'qbr'
   AND t.status NOT IN ('WAIVED','DONE');

-- 11b. Lone Star Baptist: partial progress only. Leaves 'inservice',
--      'route', 'systems' and 'first_pickup' blocking steps open, so this
--      account cannot be activated — that is the intended demo state.
UPDATE melrah.onboarding_task t
   SET status       = 'DONE',
       completed_at = timestamptz '2026-08-05 09:00-05',
       note         = 'DEMO — completed during implementation'
  FROM melrah.account a
 WHERE t.account_id = a.id
   AND a.name = 'DEMO — Lone Star Baptist Health'
   AND a.tenant_id = '1541bcd7-6955-47ca-8aa3-5d27f9d078f1'
   AND t.step_key IN ('nda','agreement','reg_review','site_survey')
   AND t.status <> 'DONE';

UPDATE melrah.onboarding_task t
   SET status = 'IN_PROGRESS',
       note   = 'DEMO — in-service sessions scheduled for w/c 2026-08-24'
  FROM melrah.account a
 WHERE t.account_id = a.id
   AND a.name = 'DEMO — Lone Star Baptist Health'
   AND a.tenant_id = '1541bcd7-6955-47ca-8aa3-5d27f9d078f1'
   AND t.step_key = 'inservice'
   AND t.status = 'OPEN';


-- =====================================================================
-- 12. ACCOUNT ACTIVATION — Cascade Valley -> ACTIVE.
--     Passes enforce_activation_gate because every blocking step now has
--     a DONE task (and the non-blocking QBR step is WAIVED anyway).
--     Lone Star Baptist stays at ONBOARDING.
-- =====================================================================
UPDATE melrah.account
   SET stage = 'ACTIVE'
 WHERE name = 'DEMO — Cascade Valley Health Partners'
   AND tenant_id = '1541bcd7-6955-47ca-8aa3-5d27f9d078f1'
   AND stage <> 'ACTIVE';


COMMIT;


-- =====================================================================
-- 13. VERIFICATION (optional, read-only) — uncomment to run after apply.
-- =====================================================================
-- SELECT 'device' t, count(*) FROM melrah.device WHERE sku LIKE 'DEMO-%'
-- UNION ALL SELECT 'account', count(*) FROM melrah.account WHERE name LIKE 'DEMO — %'
-- UNION ALL SELECT 'facility', count(*) FROM melrah.facility WHERE name LIKE 'DEMO — %'
-- UNION ALL SELECT 'work_order', count(*) FROM melrah.work_order WHERE wo_number LIKE 'DEMO-WO-%'
-- UNION ALL SELECT 'work_order_line', count(*) FROM melrah.work_order_line wl
--            JOIN melrah.work_order w ON w.id = wl.work_order_id WHERE w.wo_number LIKE 'DEMO-WO-%'
-- UNION ALL SELECT 'lot', count(*) FROM melrah.lot WHERE lot_number LIKE 'DEMO-LOT-%'
-- UNION ALL SELECT 'qc_inspection', count(*) FROM melrah.qc_inspection q
--            JOIN melrah.lot l ON l.id = q.lot_id WHERE l.lot_number LIKE 'DEMO-LOT-%'
-- UNION ALL SELECT 'custody_event', count(*) FROM melrah.custody_event c
--            JOIN melrah.work_order w ON w.id = c.work_order_id WHERE w.wo_number LIKE 'DEMO-WO-%'
-- UNION ALL SELECT 'nonconformance', count(*) FROM melrah.nonconformance WHERE ncr_number LIKE 'DEMO-NCR-%'
-- UNION ALL SELECT 'onboarding_task', count(*) FROM melrah.onboarding_task t
--            JOIN melrah.account a ON a.id = t.account_id WHERE a.name LIKE 'DEMO — %';
--
-- SELECT lot_number, status, qty_received, qty_released, released_at
--   FROM melrah.lot WHERE lot_number LIKE 'DEMO-LOT-%' ORDER BY lot_number;
-- SELECT * FROM melrah.lot_status WHERE lot_number LIKE 'DEMO-LOT-%' ORDER BY lot_number;


-- =====================================================================
-- 14. PURGE SCRIPT — removes EXACTLY what section 1-12 inserted.
--     COMMENTED OUT ON PURPOSE. Uncomment the whole block to run.
--
--     melrah.custody_append_only() and melrah.qc_append_only() reject
--     DELETE unless the session GUC melrah.purge = 'on', hence the
--     set_config call inside the transaction. set_config(..., true) is
--     transaction-local, so it lapses at COMMIT/ROLLBACK.
--
--     Deletion order is FK-safe:
--       nonconformance -> qc_inspection -> lot -> custody_event ->
--       work_order_line -> work_order -> onboarding_task -> facility ->
--       account -> device
--
--     (There is also a built-in melrah.purge_account(uuid, p_commit =>
--      true) that does the same thing per account, but it does NOT remove
--      the demo device catalogue rows.)
-- =====================================================================
/*
BEGIN;

SELECT set_config('melrah.purge', 'on', true);

DELETE FROM melrah.nonconformance
 WHERE ncr_number LIKE 'DEMO-NCR-%';

DELETE FROM melrah.qc_inspection q
 USING melrah.lot l
 WHERE q.lot_id = l.id
   AND l.lot_number LIKE 'DEMO-LOT-%';

DELETE FROM melrah.lot
 WHERE lot_number LIKE 'DEMO-LOT-%';

DELETE FROM melrah.custody_event c
 USING melrah.work_order w
 WHERE c.work_order_id = w.id
   AND w.wo_number LIKE 'DEMO-WO-%';

DELETE FROM melrah.work_order_line wl
 USING melrah.work_order w
 WHERE wl.work_order_id = w.id
   AND w.wo_number LIKE 'DEMO-WO-%';

DELETE FROM melrah.work_order
 WHERE wo_number LIKE 'DEMO-WO-%';

DELETE FROM melrah.onboarding_task t
 USING melrah.account a
 WHERE t.account_id = a.id
   AND a.name LIKE 'DEMO — %'
   AND a.tenant_id = '1541bcd7-6955-47ca-8aa3-5d27f9d078f1';

DELETE FROM melrah.facility f
 USING melrah.account a
 WHERE f.account_id = a.id
   AND a.name LIKE 'DEMO — %'
   AND a.tenant_id = '1541bcd7-6955-47ca-8aa3-5d27f9d078f1';

DELETE FROM melrah.account
 WHERE name LIKE 'DEMO — %'
   AND tenant_id = '1541bcd7-6955-47ca-8aa3-5d27f9d078f1';

DELETE FROM melrah.device
 WHERE sku LIKE 'DEMO-%';

SELECT set_config('melrah.purge', 'off', true);

COMMIT;
*/
