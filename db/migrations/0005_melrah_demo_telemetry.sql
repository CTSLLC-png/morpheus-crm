-- =============================================================
--  MELRAH — demo telemetry seed for capture-rate, inventory and
--  billing views introduced in 0004_melrah_capture_inventory_billing.
--
--  The existing Melrah rows are pilot data prefixed "DEMO —". This
--  migration extends that same pilot with realistic, internally
--  consistent telemetry so the new views return real numbers instead
--  of nulls:
--
--    - work_order_visit  for the work orders that actually have
--      custody events (DEMO-WO-1004 and DEMO-WO-1006 have none, so
--      they get no visit — a work order nobody has touched yet
--      should not show a phantom site visit).
--    - loss_event        reconciling exactly against the shortfalls
--      already present in work_order_line and lot. A shortfall is
--      only booked as a loss once the underlying quantity is actually
--      known: work_order_line.received_qty or lot.qty_released being
--      NULL means "not yet determined" (still in transit / still in
--      QC), not a 100% loss, so those rows are deliberately left
--      without a matching loss_event. Only lines/lots with a
--      determined quantity get one, and it sums exactly to
--      expected_qty - received_qty (collection) or
--      qty_received - qty_released (viability).
--    - inventory + inventory_movement across the four hubs, with the
--      balance always equal to the sum of that hub/device's ledger.
--    - rate_card covering every unit the schema allows.
--    - one ISSUED and one DRAFT invoice for the closed/released work
--      orders, with lines priced off the rate card using the actual
--      hours/miles the seeded visits produce.
--
--  ADDITIVE ONLY, IDEMPOTENT. Every insert is guarded (an existing
--  unique constraint with ON CONFLICT DO NOTHING, or an explicit
--  WHERE NOT EXISTS) so re-running this file changes nothing. No
--  pre-existing row is updated or deleted, except the running
--  qty_on_hand balance on the inventory rows this file itself creates
--  and the subtotal/tax/total on the two invoices this file itself
--  creates — both recomputed from this file's own ledger/lines each
--  run, so a re-run is still a no-op.
-- =============================================================

-- =============================================================
--  1. WORK ORDER VISITS
-- =============================================================

do $$
declare
  wo1001 uuid;
  wo1002 uuid;
  wo1003 uuid;
  wo1005 uuid;
begin
  select id into wo1001 from melrah.work_order where wo_number = 'DEMO-WO-1001';
  select id into wo1002 from melrah.work_order where wo_number = 'DEMO-WO-1002';
  select id into wo1003 from melrah.work_order where wo_number = 'DEMO-WO-1003';
  select id into wo1005 from melrah.work_order where wo_number = 'DEMO-WO-1005';

  if wo1001 is null or wo1002 is null or wo1003 is null or wo1005 is null then
    raise notice 'melrah demo work orders not found — skipping visit seed';
    return;
  end if;

  insert into melrah.work_order_visit
    (work_order_id, visit_seq, technician, vehicle_id, arrived_at, departed_at,
     odometer_start, odometer_end, notes)
  values
    -- PNW-01 Portland Metro: short in-metro run.
    (wo1001, 1, 'DEMO — T. Fennimore', 'DEMO-VAN-04',
     '2026-07-13 15:35:00+00', '2026-07-13 16:20:00+00', 48562.0, 48579.4,
     'DEMO seed — Portland Metro single-stop pickup'),
    -- PNW-02 Willamette Valley: regional run, longer than the metro routes.
    (wo1002, 1, 'DEMO — R. Castellano', 'DEMO-VAN-11',
     '2026-08-03 14:40:00+00', '2026-08-03 15:35:00+00', 51820.0, 52038.0,
     'DEMO seed — Willamette Valley regional pickup'),
    -- PNW-04 Puget Sound: Seattle facility, short run to the Puget Sound hub.
    (wo1003, 1, 'DEMO — L. Okafor', 'DEMO-VAN-02',
     '2026-08-14 15:10:00+00', '2026-08-14 15:50:00+00', 22150.0, 22169.5,
     'DEMO seed — Puget Sound metro pickup'),
    -- TX-07 DFW North: Dallas facility, short run to the North Texas hub.
    (wo1005, 1, 'DEMO — M. Ferreira', 'DEMO-VAN-07',
     '2026-08-19 09:20:00+00', '2026-08-19 10:05:00+00', 15230.0, 15258.0,
     'DEMO seed — DFW North metro pickup')
  on conflict (work_order_id, visit_seq) do nothing;
end $$;


-- =============================================================
--  2. LOSS EVENTS — reconciled to real shortfalls
-- =============================================================

do $$
begin
  -- COLLECTION: expected_qty - received_qty per work_order_line, only
  -- for lines where received_qty is actually known (DEMO-WO-1001 and
  -- DEMO-WO-1002 have completed receiving; every other demo work
  -- order still has received_qty = NULL and is deliberately skipped).
  insert into melrah.loss_event
    (tenant_id, work_order_id, device_id, reason_code, qty, recorded_at, recorded_by, note)
  select w.tenant_id, w.id, d.id, x.reason_code, x.qty, x.recorded_at::timestamptz,
         'DEMO — Ops Intake', x.note
  from (values
    ('DEMO-WO-1001', 'DEMO-ECG-LEAD-03', 'NOT_PRESENTED',    2, '2026-07-14 15:20:00+00',
      'DEMO seed — 2 leadsets not presented at pickup, per facility SPD count discrepancy'),
    ('DEMO-WO-1001', 'DEMO-SPO2-ADT-01', 'CONTAMINATED_SRC', 10, '2026-07-14 15:25:00+00',
      'DEMO seed — 10 sensors contaminated at source, rejected at receiving'),
    ('DEMO-WO-1002', 'DEMO-DVT-SLV-10',  'NOT_PRESENTED',    20, '2026-08-04 14:50:00+00',
      'DEMO seed — 20 sleeves not presented, short count vs manifest'),
    ('DEMO-WO-1002', 'DEMO-EP-CBL-20',   'DAMAGED_TRANSIT',   5, '2026-08-04 14:55:00+00',
      'DEMO seed — 5 cables damaged in transit, connector shear'),
    ('DEMO-WO-1002', 'DEMO-LAP-SCS-30',  'WRONG_ITEM',        4, '2026-08-04 15:00:00+00',
      'DEMO seed — 4 units were an ineligible SKU variant'),
    ('DEMO-WO-1002', 'DEMO-US-ICE-40',   'HOLD_TIME_EXPIRED', 6, '2026-08-04 15:05:00+00',
      'DEMO seed — 6 catheters exceeded hold-time window before receipt')
  ) as x(wo_number, sku, reason_code, qty, recorded_at, note)
  join melrah.work_order w on w.wo_number = x.wo_number
  join melrah.device d     on d.sku = x.sku
  where not exists (
    select 1 from melrah.loss_event e
    where e.work_order_id = w.id and e.device_id = d.id and e.reason_code = x.reason_code
  );

  -- VIABILITY: qty_received - qty_released per lot, only for lots where
  -- qty_released is actually known (DEMO-LOT-26-0001 released, and
  -- DEMO-LOT-26-0005 fully rejected with qty_released = 0 — both
  -- determined outcomes). Lots still QUARANTINE/ON_HOLD have
  -- qty_released = NULL, meaning QC hasn't dispositioned them yet, so
  -- they are deliberately skipped rather than booked as a full loss.
  insert into melrah.loss_event
    (tenant_id, lot_id, work_order_id, device_id, reason_code, qty, recorded_at, recorded_by, note)
  select l.tenant_id, l.id, l.work_order_id, l.device_id, x.reason_code, x.qty,
         x.recorded_at::timestamptz, 'DEMO — QC Bench', x.note
  from (values
    ('DEMO-LOT-26-0001', 'FAILED_FUNCTIONAL',   8, '2026-07-15 10:10:00+00',
      'DEMO seed — 8 sensors failed post-clean functional test'),
    ('DEMO-LOT-26-0005', 'MATERIAL_DEGRADED',  30, '2026-08-06 09:30:00+00',
      'DEMO seed — full lot rejected, catheter substrate degraded beyond spec')
  ) as x(lot_number, reason_code, qty, recorded_at, note)
  join melrah.lot l on l.lot_number = x.lot_number
  where not exists (
    select 1 from melrah.loss_event e where e.lot_id = l.id and e.reason_code = x.reason_code
  );
end $$;


-- =============================================================
--  3. HUB INVENTORY + MOVEMENT LEDGER
-- =============================================================

do $$
begin
  -- Inventory rows (balance corrected from the ledger below).
  insert into melrah.inventory (hub_id, device_id, qty_on_hand, qty_reserved, reorder_point)
  select h.id, d.id, 0, 0, x.reorder_point
  from (values
    ('HUB-PDX', 'DEMO-ECG-LEAD-03', null::integer),
    ('HUB-PDX', 'DEMO-SPO2-ADT-01', 50),
    ('HUB-PDX', 'DEMO-DVT-SLV-10',  null::integer),
    ('HUB-SEA', 'DEMO-SPO2-PED-02', 20),
    ('HUB-SEA', 'DEMO-US-ICE-40',   10),
    ('HUB-DFW', 'DEMO-EP-CATH-21',  25),
    ('HUB-DFW', 'DEMO-LAP-SCS-30',  null::integer),
    ('HUB-AUS', 'DEMO-ORTH-SHV-50', null::integer),
    ('HUB-AUS', 'DEMO-LAP-TRO-31',  12),
    ('HUB-AUS', 'DEMO-EP-CBL-20',   30)
  ) as x(hub_code, sku, reorder_point)
  join melrah.hub h    on h.code = x.hub_code
  join melrah.device d on d.sku  = x.sku
  on conflict (hub_id, device_id) do nothing;

  -- Movement ledger. inventory.qty_on_hand is reconciled to this below.
  insert into melrah.inventory_movement (hub_id, device_id, qty_delta, movement_type, occurred_at, actor, note)
  select h.id, d.id, x.qty_delta, x.movement_type, x.occurred_at::timestamptz, 'DEMO — Hub Ops', x.note
  from (values
    ('HUB-PDX', 'DEMO-ECG-LEAD-03', 150, 'RECEIPT',     '2026-07-16 09:00:00+00', 'DEMO seed — reprocessed lot returned to stock'),
    ('HUB-PDX', 'DEMO-ECG-LEAD-03', -40, 'RELEASE',     '2026-07-20 11:00:00+00', 'DEMO seed — released to Cascade Valley'),
    ('HUB-PDX', 'DEMO-ECG-LEAD-03',  -5, 'ADJUSTMENT',  '2026-07-25 08:00:00+00', 'DEMO seed — cycle count correction'),

    ('HUB-PDX', 'DEMO-SPO2-ADT-01', 232, 'RECEIPT',     '2026-07-16 09:15:00+00', 'DEMO seed — released lot DEMO-LOT-26-0001 into stock'),
    ('HUB-PDX', 'DEMO-SPO2-ADT-01', -210,'RELEASE',     '2026-07-22 13:00:00+00', 'DEMO seed — released to facility'),

    ('HUB-PDX', 'DEMO-DVT-SLV-10',   90, 'RECEIPT',     '2026-08-02 09:00:00+00', 'DEMO seed — reprocessed stock receipt'),
    ('HUB-PDX', 'DEMO-DVT-SLV-10',  -30, 'RELEASE',     '2026-08-10 10:00:00+00', 'DEMO seed — released to facility'),

    ('HUB-SEA', 'DEMO-SPO2-PED-02',  75, 'RECEIPT',     '2026-07-02 09:00:00+00', 'DEMO seed — reprocessed stock receipt'),
    ('HUB-SEA', 'DEMO-SPO2-PED-02', -70, 'RELEASE',     '2026-08-05 09:00:00+00', 'DEMO seed — released to facility'),

    ('HUB-SEA', 'DEMO-US-ICE-40',    15, 'RECEIPT',     '2026-06-21 09:00:00+00', 'DEMO seed — reprocessed stock receipt'),
    ('HUB-SEA', 'DEMO-US-ICE-40',    -2, 'SHRINK',      '2026-07-11 09:00:00+00', 'DEMO seed — warehouse cycle-count shrink'),

    ('HUB-DFW', 'DEMO-EP-CATH-21',   40, 'RECEIPT',     '2026-07-06 09:00:00+00', 'DEMO seed — reprocessed stock receipt'),
    ('HUB-DFW', 'DEMO-EP-CATH-21',  -18, 'RELEASE',     '2026-08-02 09:00:00+00', 'DEMO seed — released to facility'),
    ('HUB-DFW', 'DEMO-EP-CATH-21',   -5, 'TRANSFER_OUT', '2026-08-15 09:00:00+00', 'DEMO seed — transfer to HUB-AUS'),

    ('HUB-DFW', 'DEMO-LAP-SCS-30',   60, 'RECEIPT',     '2026-07-11 09:00:00+00', 'DEMO seed — reprocessed stock receipt'),
    ('HUB-DFW', 'DEMO-LAP-SCS-30',  -55, 'RELEASE',     '2026-08-12 09:00:00+00', 'DEMO seed — released to facility'),

    ('HUB-AUS', 'DEMO-ORTH-SHV-50',  25, 'RECEIPT',     '2026-07-02 09:00:00+00', 'DEMO seed — reprocessed stock receipt'),
    ('HUB-AUS', 'DEMO-ORTH-SHV-50', -10, 'RELEASE',     '2026-08-06 09:00:00+00', 'DEMO seed — released to facility'),

    ('HUB-AUS', 'DEMO-LAP-TRO-31',   50, 'RECEIPT',     '2026-06-16 09:00:00+00', 'DEMO seed — reprocessed stock receipt'),
    ('HUB-AUS', 'DEMO-LAP-TRO-31',  -45, 'RELEASE',     '2026-08-02 09:00:00+00', 'DEMO seed — released to facility'),
    ('HUB-AUS', 'DEMO-LAP-TRO-31',    5, 'TRANSFER_IN', '2026-08-15 09:30:00+00', 'DEMO seed — transfer in from HUB-DFW'),

    ('HUB-AUS', 'DEMO-EP-CBL-20',    45, 'RECEIPT',     '2026-07-02 09:00:00+00', 'DEMO seed — reprocessed stock receipt'),
    ('HUB-AUS', 'DEMO-EP-CBL-20',   -20, 'RELEASE',     '2026-08-11 09:00:00+00', 'DEMO seed — released to facility')
  ) as x(hub_code, sku, qty_delta, movement_type, occurred_at, note)
  join melrah.hub h    on h.code = x.hub_code
  join melrah.device d on d.sku  = x.sku
  where not exists (
    select 1 from melrah.inventory_movement m
    where m.hub_id = h.id and m.device_id = d.id and m.movement_type = x.movement_type
      and m.qty_delta = x.qty_delta and m.occurred_at = x.occurred_at::timestamptz
  );

  -- Reconcile the balance to this file's own ledger (recomputed every
  -- run, so re-running is a no-op).
  update melrah.inventory i
  set qty_on_hand = coalesce((
        select sum(m.qty_delta) from melrah.inventory_movement m
        where m.hub_id = i.hub_id and m.device_id = i.device_id
      ), 0),
      updated_at = now()
  where exists (
    select 1 from melrah.inventory_movement m
    where m.hub_id = i.hub_id and m.device_id = i.device_id
  );
end $$;


-- =============================================================
--  4. RATE CARD — default pricing, one row per unit the schema allows
-- =============================================================

do $$
declare mt uuid;
begin
  select core.tenant_id('melrah') into mt;
  if mt is null then
    raise notice 'melrah tenant not found — skipping rate card seed';
    return;
  end if;

  insert into melrah.rate_card (tenant_id, account_id, service_code, label, unit, unit_price, currency, effective_from)
  select mt, null, x.service_code, x.label, x.unit, x.unit_price, 'USD', date '2026-01-01'
  from (values
    ('SVC-VISIT', 'DEMO — Site visit fee',            'VISIT', 75.00),
    ('SVC-MILE',  'DEMO — Mileage',                   'MILE',   1.25),
    ('SVC-HOUR',  'DEMO — On-site labor',              'HOUR', 95.00),
    ('SVC-UNIT',  'DEMO — Per-unit collection fee',    'UNIT',  0.85),
    ('SVC-LOT',   'DEMO — Lot processing fee',         'LOT', 150.00)
  ) as x(service_code, label, unit, unit_price)
  where not exists (
    select 1 from melrah.rate_card r where r.service_code = x.service_code and r.account_id is null
  );
end $$;


-- =============================================================
--  5. INVOICES — one ISSUED (closed WO), one DRAFT (released WO)
--     Lines are priced off the rate card using the actual hours and
--     miles the seeded visits produce (read from v_work_order_billing,
--     not recomputed by hand). subtotal/total are read back from the
--     lines' generated `amount` column after insert.
-- =============================================================

do $$
declare
  mt          uuid;
  wo1001      uuid;
  wo1005      uuid;
  acct1001    uuid;
  acct1005    uuid;
  inv1        uuid;
  inv2        uuid;
  visit_price numeric;
  mile_price  numeric;
  hour_price  numeric;
  wo1001_visits int;
  wo1001_hours  numeric;
  wo1001_miles  numeric;
  wo1005_visits int;
  wo1005_hours  numeric;
  wo1005_miles  numeric;
begin
  select core.tenant_id('melrah') into mt;
  if mt is null then
    raise notice 'melrah tenant not found — skipping invoice seed';
    return;
  end if;

  select w.id, w.account_id into wo1001, acct1001 from melrah.work_order w where w.wo_number = 'DEMO-WO-1001';
  select w.id, w.account_id into wo1005, acct1005 from melrah.work_order w where w.wo_number = 'DEMO-WO-1005';

  if wo1001 is null or wo1005 is null then
    raise notice 'melrah demo work orders not found — skipping invoice seed';
    return;
  end if;

  select unit_price into visit_price from melrah.rate_card where service_code = 'SVC-VISIT' and account_id is null;
  select unit_price into mile_price  from melrah.rate_card where service_code = 'SVC-MILE'  and account_id is null;
  select unit_price into hour_price  from melrah.rate_card where service_code = 'SVC-HOUR'  and account_id is null;

  select visit_count, hours_on_site, miles_traveled into wo1001_visits, wo1001_hours, wo1001_miles
    from melrah.v_work_order_billing where work_order_id = wo1001;
  select visit_count, hours_on_site, miles_traveled into wo1005_visits, wo1005_hours, wo1005_miles
    from melrah.v_work_order_billing where work_order_id = wo1005;

  -- Invoice 1: ISSUED, for the closed collection run DEMO-WO-1001.
  insert into melrah.invoice
    (tenant_id, account_id, invoice_number, period_start, period_end, status, currency, issued_at, due_at, notes)
  values
    (mt, acct1001, 'DEMO-INV-2026-0001', date '2026-07-01', date '2026-07-31', 'ISSUED', 'USD',
     '2026-07-21 09:00:00+00', date '2026-08-20', 'DEMO seed — invoice for closed collection run DEMO-WO-1001')
  on conflict (invoice_number) do nothing;

  select id into inv1 from melrah.invoice where invoice_number = 'DEMO-INV-2026-0001';

  insert into melrah.invoice_line (invoice_id, work_order_id, service_code, description, qty, unit, unit_price, sort_order)
  select inv1, wo1001, x.service_code, x.description, x.qty, x.unit, x.unit_price, x.sort_order
  from (values
    ('SVC-VISIT', 'DEMO — Site visit — DEMO-WO-1001',      wo1001_visits::numeric, 'VISIT', visit_price, 10),
    ('SVC-HOUR',  'DEMO — On-site labor — DEMO-WO-1001',   wo1001_hours,           'HOUR',  hour_price,  20),
    ('SVC-MILE',  'DEMO — Mileage — DEMO-WO-1001',         wo1001_miles,           'MILE',  mile_price,  30)
  ) as x(service_code, description, qty, unit, unit_price, sort_order)
  where not exists (
    select 1 from melrah.invoice_line il
    where il.invoice_id = inv1 and il.work_order_id = wo1001 and il.service_code = x.service_code
  );

  -- Invoice 2: DRAFT, for the released (not yet closed) DEMO-WO-1005.
  insert into melrah.invoice
    (tenant_id, account_id, invoice_number, period_start, period_end, status, currency, due_at, notes)
  values
    (mt, acct1005, 'DEMO-INV-2026-0002', date '2026-08-01', date '2026-08-31', 'DRAFT', 'USD',
     date '2026-09-19', 'DEMO seed — draft invoice for DEMO-WO-1005, pending close-out')
  on conflict (invoice_number) do nothing;

  select id into inv2 from melrah.invoice where invoice_number = 'DEMO-INV-2026-0002';

  insert into melrah.invoice_line (invoice_id, work_order_id, service_code, description, qty, unit, unit_price, sort_order)
  select inv2, wo1005, x.service_code, x.description, x.qty, x.unit, x.unit_price, x.sort_order
  from (values
    ('SVC-VISIT', 'DEMO — Site visit — DEMO-WO-1005',      wo1005_visits::numeric, 'VISIT', visit_price, 10),
    ('SVC-HOUR',  'DEMO — On-site labor — DEMO-WO-1005',   wo1005_hours,           'HOUR',  hour_price,  20),
    ('SVC-MILE',  'DEMO — Mileage — DEMO-WO-1005',         wo1005_miles,           'MILE',  mile_price,  30)
  ) as x(service_code, description, qty, unit, unit_price, sort_order)
  where not exists (
    select 1 from melrah.invoice_line il
    where il.invoice_id = inv2 and il.work_order_id = wo1005 and il.service_code = x.service_code
  );

  -- Reconcile subtotal/tax/total to the lines' own generated `amount`
  -- column (recomputed every run, so re-running is a no-op). Oregon
  -- (DEMO-WO-1001's facility state) has no state sales tax; Texas
  -- (DEMO-WO-1005's facility state) does, so invoice 2 carries 8.25%.
  update melrah.invoice i
  set subtotal   = s.subtotal,
      tax        = round(s.subtotal * case when i.id = inv1 then 0 else 0.0825 end, 2),
      total      = s.subtotal + round(s.subtotal * case when i.id = inv1 then 0 else 0.0825 end, 2),
      updated_at = now()
  from (
    select invoice_id, sum(amount) as subtotal
    from melrah.invoice_line
    where invoice_id in (inv1, inv2)
    group by invoice_id
  ) s
  where s.invoice_id = i.id;
end $$;


-- =============================================================
--  6. VERIFICATION
-- =============================================================
-- select facility_name, capture_rate_pct, yield_rate_pct,
--        collection_loss_qty, viability_loss_qty from melrah.v_facility_capture;
-- select wo_number, visit_count, hours_on_site, miles_traveled, invoiced
--   from melrah.v_work_order_billing order by wo_number;
-- select hub_code, device, qty_on_hand, reorder_point, below_reorder
--   from melrah.v_hub_inventory order by hub_code, device;
