-- =============================================================
--  MELRAH — capture rate, hub inventory, visit telemetry, billing
--
--  Extends the existing melrah schema with four capabilities:
--    1. Loss attribution → capture rate vs yield rate
--    2. Four regional hubs + inventory on hand per hub
--    3. Time and mileage per work-order visit (billing + regulatory)
--    4. Rate cards and invoicing generated from processed work orders
--
--  DOMAIN GROUNDING
--    Two different ratios are conflated in casual use, and the whole
--    point of this migration is to keep them apart:
--
--      capture rate = received / expected
--        How much of what was available did we actually collect?
--        A miss here is a COLLECTION problem — route, scheduling,
--        facility handling, contamination at source.
--
--      yield rate = released / received
--        Of what we collected, how much survived reprocessing?
--        A miss here is a VIABILITY problem — cycle limit reached,
--        failed functional test, material degradation.
--
--    Reporting a single blended "capture rate" hides which lever to
--    pull. loss_event.reason_code carries the category so the two
--    are always separable.
--
--  ADDITIVE ONLY. No existing table is altered except facility, which
--  gains a nullable hub_id. Safe to re-run.
-- =============================================================

-- =============================================================
--  1. LOSS ATTRIBUTION
-- =============================================================

create table if not exists melrah.loss_reason (
  code        text primary key,
  label       text not null,
  category    text not null check (category in ('COLLECTION', 'VIABILITY')),
  description text,
  sort_order  smallint not null default 0
);

comment on table melrah.loss_reason is
  'Why a unit was not reprocessed. category separates collection '
  'effectiveness from material viability.';

insert into melrah.loss_reason (code, label, category, description, sort_order) values
  ('NOT_PRESENTED',    'Not presented for collection', 'COLLECTION', 'Expected on the work order but not handed over at the facility.', 10),
  ('CONTAMINATED_SRC', 'Contaminated at source',       'COLLECTION', 'Improper segregation or handling before pickup.', 20),
  ('WRONG_ITEM',       'Wrong or ineligible item',     'COLLECTION', 'Item collected is not an accepted reprocessable SKU.', 30),
  ('DAMAGED_TRANSIT',  'Damaged in transit',           'COLLECTION', 'Physical damage between facility and hub.', 40),
  ('HOLD_TIME_EXPIRED','Hold time expired',            'COLLECTION', 'Exceeded permitted time between use and receipt.', 50),
  ('CYCLE_LIMIT',      'Cycle limit reached',          'VIABILITY',  'Device reached device.max_cycles and cannot be reprocessed again.', 60),
  ('FAILED_FUNCTIONAL','Failed functional test',       'VIABILITY',  'Did not pass post-clean functional verification.', 70),
  ('MATERIAL_DEGRADED','Material degradation',         'VIABILITY',  'Substrate could not withstand the reprocessing cycle.', 80),
  ('FAILED_CLEANING',  'Failed cleaning validation',   'VIABILITY',  'Residual soil or bioburden after cleaning.', 90),
  ('OEM_NOT_CLEARED',  'No FDA clearance for reuse',   'VIABILITY',  'Device lacks clearance for this reprocessing pathway.', 100)
on conflict (code) do nothing;


create table if not exists melrah.loss_event (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  work_order_id  uuid references melrah.work_order(id) on delete cascade,
  lot_id         uuid references melrah.lot(id) on delete cascade,
  device_id      uuid references melrah.device(id) on delete set null,
  reason_code    text not null references melrah.loss_reason(code),
  qty            integer not null check (qty > 0),
  recorded_at    timestamptz not null default now(),
  recorded_by    text,
  note           text,

  -- A loss must attach to something countable.
  constraint loss_event_has_anchor
    check (work_order_id is not null or lot_id is not null)
);

create index if not exists idx_loss_event_wo  on melrah.loss_event (work_order_id);
create index if not exists idx_loss_event_lot on melrah.loss_event (lot_id);


-- =============================================================
--  2. HUBS + INVENTORY
-- =============================================================

create table if not exists melrah.hub (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  code           text not null unique,
  name           text not null,
  address        text,
  city           text,
  state          text,
  postal_code    text,
  region         text,
  capacity_units integer check (capacity_units is null or capacity_units >= 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

comment on table melrah.hub is
  'Regional consolidation hubs holding inventory for the facilities in '
  'their catchment. Melrah is the asset owner; hub stock is what makes '
  'the client cost saving visible.';

-- Facilities are served by a hub. Nullable: a facility can exist before
-- hub assignment, and that gap is itself worth reporting on.
alter table melrah.facility add column if not exists hub_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'facility_hub_fk') then
    alter table melrah.facility
      add constraint facility_hub_fk foreign key (hub_id)
      references melrah.hub(id) on delete set null;
  end if;
end $$;

create index if not exists idx_facility_hub on melrah.facility (hub_id);


-- Current stock position. One row per hub/device.
create table if not exists melrah.inventory (
  id            uuid primary key default gen_random_uuid(),
  hub_id        uuid not null references melrah.hub(id) on delete cascade,
  device_id     uuid not null references melrah.device(id) on delete restrict,
  qty_on_hand   integer not null default 0 check (qty_on_hand >= 0),
  qty_reserved  integer not null default 0 check (qty_reserved >= 0),
  reorder_point integer check (reorder_point is null or reorder_point >= 0),
  updated_at    timestamptz not null default now(),

  constraint inventory_hub_device_unique unique (hub_id, device_id),
  constraint inventory_reserved_within_hand check (qty_reserved <= qty_on_hand)
);


-- Append-only ledger. inventory is the balance; this is the history.
-- Regulatory traceability needs the movements, not just the total.
create table if not exists melrah.inventory_movement (
  id            bigserial primary key,
  hub_id        uuid not null references melrah.hub(id) on delete cascade,
  device_id     uuid not null references melrah.device(id) on delete restrict,
  qty_delta     integer not null check (qty_delta <> 0),
  movement_type text not null check (movement_type in
                  ('RECEIPT','RELEASE','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT','SHRINK')),
  work_order_id uuid references melrah.work_order(id) on delete set null,
  lot_id        uuid references melrah.lot(id) on delete set null,
  occurred_at   timestamptz not null default now(),
  actor         text,
  note          text
);

create index if not exists idx_inv_move_hub on melrah.inventory_movement (hub_id, occurred_at desc);


-- =============================================================
--  3. VISIT TELEMETRY — time and mileage
--
--  Modelled as a separate table rather than columns on work_order,
--  following the work-order / service-appointment split: one work
--  order can require several visits (a failed pickup, a return trip),
--  and billing and DOT-style mileage records need each one.
--
--  Raw facts are stored; miles and duration are derived in the views
--  below so there is exactly one definition of each.
-- =============================================================

create table if not exists melrah.work_order_visit (
  id             uuid primary key default gen_random_uuid(),
  work_order_id  uuid not null references melrah.work_order(id) on delete cascade,
  visit_seq      smallint not null default 1,
  technician     text,
  vehicle_id     text,

  arrived_at     timestamptz,
  departed_at    timestamptz,
  odometer_start numeric(10,1) check (odometer_start is null or odometer_start >= 0),
  odometer_end   numeric(10,1) check (odometer_end   is null or odometer_end   >= 0),

  notes          text,
  created_at     timestamptz not null default now(),

  constraint visit_seq_unique unique (work_order_id, visit_seq),
  constraint visit_times_ordered
    check (arrived_at is null or departed_at is null or departed_at >= arrived_at),
  constraint visit_odometer_ordered
    check (odometer_start is null or odometer_end is null or odometer_end >= odometer_start)
);

comment on table melrah.work_order_visit is
  'One field visit. Time and mileage are captured here for billing and '
  'regulatory reporting; derived metrics live in v_work_order_billing.';

create index if not exists idx_visit_wo on melrah.work_order_visit (work_order_id);


-- =============================================================
--  4. RATE CARDS + INVOICING
-- =============================================================

create table if not exists melrah.rate_card (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  account_id     uuid references melrah.account(id) on delete cascade,  -- null = default rate
  service_code   text not null,
  label          text not null,
  unit           text not null check (unit in ('VISIT','MILE','HOUR','UNIT','LOT')),
  unit_price     numeric(12,2) not null check (unit_price >= 0),
  currency       text not null default 'USD',
  effective_from date not null default current_date,
  effective_to   date,
  active         boolean not null default true,

  constraint rate_card_dates_ordered
    check (effective_to is null or effective_to >= effective_from)
);

comment on table melrah.rate_card is
  'Pricing by service code. A row with null account_id is the default; '
  'an account-specific row of the same service_code overrides it.';

create index if not exists idx_rate_card_lookup
  on melrah.rate_card (service_code, account_id, active);


create table if not exists melrah.invoice (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  account_id     uuid not null references melrah.account(id) on delete restrict,
  invoice_number text not null unique,
  period_start   date,
  period_end     date,
  status         text not null default 'DRAFT'
                 check (status in ('DRAFT','ISSUED','PAID','VOID')),
  currency       text not null default 'USD',
  subtotal       numeric(12,2) not null default 0,
  tax            numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  issued_at      timestamptz,
  due_at         date,
  paid_at        timestamptz,
  void_reason    text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint invoice_period_ordered
    check (period_end is null or period_start is null or period_end >= period_start),
  constraint invoice_issued_has_date
    check (status = 'DRAFT' or issued_at is not null),
  constraint invoice_void_has_reason
    check (status <> 'VOID' or void_reason is not null)
);


create table if not exists melrah.invoice_line (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references melrah.invoice(id) on delete cascade,
  work_order_id uuid references melrah.work_order(id) on delete set null,
  service_code  text,
  description   text not null,
  qty           numeric(12,2) not null check (qty >= 0),
  unit          text,
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  amount        numeric(12,2) generated always as (round(qty * unit_price, 2)) stored,
  sort_order    smallint not null default 0
);

create index if not exists idx_invoice_line_invoice on melrah.invoice_line (invoice_id);
create index if not exists idx_invoice_line_wo on melrah.invoice_line (work_order_id);


-- =============================================================
--  5. DERIVED VIEWS
-- =============================================================

-- Capture rate and yield rate per facility, with loss split by cause.
create or replace view melrah.v_facility_capture as
with wo as (
  select w.id, w.facility_id, w.account_id
  from melrah.work_order w
  where w.status not in ('CANCELLED', 'DRAFT')
),
line_totals as (
  select wo.facility_id,
         sum(l.expected_qty)              as expected_qty,
         sum(coalesce(l.received_qty, 0)) as received_qty
  from wo join melrah.work_order_line l on l.work_order_id = wo.id
  group by wo.facility_id
),
lot_totals as (
  select wo.facility_id,
         sum(coalesce(lo.qty_received, 0)) as lot_received,
         sum(coalesce(lo.qty_released, 0)) as lot_released
  from wo join melrah.lot lo on lo.work_order_id = wo.id
  group by wo.facility_id
),
losses as (
  select wo.facility_id, r.category, sum(e.qty) as qty
  from melrah.loss_event e
  join melrah.loss_reason r on r.code = e.reason_code
  left join melrah.lot lo on lo.id = e.lot_id
  join wo on wo.id = coalesce(e.work_order_id, lo.work_order_id)
  group by wo.facility_id, r.category
)
select
  f.id                          as facility_id,
  f.name                        as facility_name,
  f.city, f.state,
  f.hub_id,
  a.name                        as account_name,
  coalesce(lt.expected_qty, 0)  as expected_qty,
  coalesce(lt.received_qty, 0)  as received_qty,
  coalesce(ot.lot_received, 0)  as lot_received,
  coalesce(ot.lot_released, 0)  as lot_released,
  coalesce((select qty from losses x where x.facility_id = f.id and x.category = 'COLLECTION'), 0) as collection_loss_qty,
  coalesce((select qty from losses x where x.facility_id = f.id and x.category = 'VIABILITY'),  0) as viability_loss_qty,
  -- capture rate: did we collect what was available?
  case when coalesce(lt.expected_qty, 0) > 0
       then round(100.0 * lt.received_qty / lt.expected_qty, 1) end as capture_rate_pct,
  -- yield rate: did what we collected survive reprocessing?
  case when coalesce(ot.lot_received, 0) > 0
       then round(100.0 * ot.lot_released / ot.lot_received, 1) end as yield_rate_pct
from melrah.facility f
left join melrah.account a  on a.id = f.account_id
left join line_totals lt    on lt.facility_id = f.id
left join lot_totals  ot    on ot.facility_id = f.id;

comment on view melrah.v_facility_capture is
  'Per-facility capture rate (collection effectiveness) and yield rate '
  '(material viability), with loss quantities split by cause.';


-- Hub stock position with the facilities each hub serves.
create or replace view melrah.v_hub_inventory as
select h.id as hub_id, h.code as hub_code, h.name as hub_name,
       h.city, h.state, h.region, h.capacity_units,
       d.id as device_id, d.sku, d.description as device, d.category,
       coalesce(i.qty_on_hand, 0)  as qty_on_hand,
       coalesce(i.qty_reserved, 0) as qty_reserved,
       coalesce(i.qty_on_hand, 0) - coalesce(i.qty_reserved, 0) as qty_available,
       i.reorder_point,
       (i.reorder_point is not null and coalesce(i.qty_on_hand,0) <= i.reorder_point) as below_reorder,
       (select count(*) from melrah.facility f where f.hub_id = h.id and f.active) as facilities_served
from melrah.hub h
left join melrah.inventory i on i.hub_id = h.id
left join melrah.device d    on d.id = i.device_id;


-- Billable summary per work order: visits, hours, miles.
create or replace view melrah.v_work_order_billing as
select w.id as work_order_id, w.wo_number, w.status, w.wo_type,
       w.account_id, w.facility_id, w.scheduled_for, w.route,
       count(v.id)                                                     as visit_count,
       round(sum(extract(epoch from (v.departed_at - v.arrived_at)) / 3600.0)::numeric, 2) as hours_on_site,
       round(sum(v.odometer_end - v.odometer_start)::numeric, 1)       as miles_traveled,
       min(v.arrived_at)                                               as first_arrival,
       max(v.departed_at)                                              as last_departure,
       exists (select 1 from melrah.invoice_line il where il.work_order_id = w.id) as invoiced
from melrah.work_order w
left join melrah.work_order_visit v on v.work_order_id = w.id
group by w.id;

comment on view melrah.v_work_order_billing is
  'Time and mileage rolled up per work order. Single definition of '
  'hours and miles so billing and compliance reporting cannot diverge.';


-- =============================================================
--  6. RLS — matches the existing melrah pattern exactly
--     (core.member_of(tenant_id), or an EXISTS join for children)
-- =============================================================

alter table melrah.loss_reason        enable row level security;
alter table melrah.loss_event         enable row level security;
alter table melrah.hub                enable row level security;
alter table melrah.inventory          enable row level security;
alter table melrah.inventory_movement enable row level security;
alter table melrah.work_order_visit   enable row level security;
alter table melrah.rate_card          enable row level security;
alter table melrah.invoice            enable row level security;
alter table melrah.invoice_line       enable row level security;

drop policy if exists melrah_members on melrah.loss_reason;
create policy melrah_members on melrah.loss_reason for all to authenticated
  using (core.member_of(core.tenant_id('melrah'))) with check (core.member_of(core.tenant_id('melrah')));

drop policy if exists melrah_members on melrah.loss_event;
create policy melrah_members on melrah.loss_event for all to authenticated
  using (core.member_of(tenant_id)) with check (core.member_of(tenant_id));

drop policy if exists melrah_members on melrah.hub;
create policy melrah_members on melrah.hub for all to authenticated
  using (core.member_of(tenant_id)) with check (core.member_of(tenant_id));

drop policy if exists melrah_members on melrah.inventory;
create policy melrah_members on melrah.inventory for all to authenticated
  using (exists (select 1 from melrah.hub h where h.id = inventory.hub_id and core.member_of(h.tenant_id)))
  with check (exists (select 1 from melrah.hub h where h.id = inventory.hub_id and core.member_of(h.tenant_id)));

drop policy if exists melrah_members on melrah.inventory_movement;
create policy melrah_members on melrah.inventory_movement for all to authenticated
  using (exists (select 1 from melrah.hub h where h.id = inventory_movement.hub_id and core.member_of(h.tenant_id)))
  with check (exists (select 1 from melrah.hub h where h.id = inventory_movement.hub_id and core.member_of(h.tenant_id)));

drop policy if exists melrah_members on melrah.work_order_visit;
create policy melrah_members on melrah.work_order_visit for all to authenticated
  using (exists (select 1 from melrah.work_order w where w.id = work_order_visit.work_order_id and core.member_of(w.tenant_id)))
  with check (exists (select 1 from melrah.work_order w where w.id = work_order_visit.work_order_id and core.member_of(w.tenant_id)));

drop policy if exists melrah_members on melrah.rate_card;
create policy melrah_members on melrah.rate_card for all to authenticated
  using (core.member_of(tenant_id)) with check (core.member_of(tenant_id));

drop policy if exists melrah_members on melrah.invoice;
create policy melrah_members on melrah.invoice for all to authenticated
  using (core.member_of(tenant_id)) with check (core.member_of(tenant_id));

drop policy if exists melrah_members on melrah.invoice_line;
create policy melrah_members on melrah.invoice_line for all to authenticated
  using (exists (select 1 from melrah.invoice i where i.id = invoice_line.invoice_id and core.member_of(i.tenant_id)))
  with check (exists (select 1 from melrah.invoice i where i.id = invoice_line.invoice_id and core.member_of(i.tenant_id)));


-- =============================================================
--  7. PUBLIC PASSTHROUGH VIEWS (PostgREST only exposes public)
-- =============================================================

create or replace view public.ml_loss_reason        as select * from melrah.loss_reason;
create or replace view public.ml_loss_event         as select * from melrah.loss_event;
create or replace view public.ml_hub                as select * from melrah.hub;
create or replace view public.ml_inventory          as select * from melrah.inventory;
create or replace view public.ml_inventory_movement as select * from melrah.inventory_movement;
create or replace view public.ml_work_order_visit   as select * from melrah.work_order_visit;
create or replace view public.ml_rate_card          as select * from melrah.rate_card;
create or replace view public.ml_invoice            as select * from melrah.invoice;
create or replace view public.ml_invoice_line       as select * from melrah.invoice_line;
create or replace view public.ml_facility_capture   as select * from melrah.v_facility_capture;
create or replace view public.ml_hub_inventory      as select * from melrah.v_hub_inventory;
create or replace view public.ml_work_order_billing as select * from melrah.v_work_order_billing;

-- Read-only to clients. The existing ml_* views were granted full DML,
-- which db/PLATFORM.md flags as a latent hazard; new views do not
-- repeat that mistake.
do $$
declare v text;
begin
  foreach v in array array[
    'ml_loss_reason','ml_loss_event','ml_hub','ml_inventory','ml_inventory_movement',
    'ml_work_order_visit','ml_rate_card','ml_invoice','ml_invoice_line',
    'ml_facility_capture','ml_hub_inventory','ml_work_order_billing'
  ] loop
    execute format('grant select on public.%I to authenticated', v);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated, anon', v);
  end loop;
end $$;


-- =============================================================
--  8. SEED — the four hubs
--
--  Codes and regions are derived from the routes actually present in
--  the data (PNW-01/02/04, TX-07/11) and the facility geography
--  (Portland OR, Springfield OR, Seattle WA, Dallas TX, Austin TX).
--
--  Street addresses are deliberately left NULL — inventing them would
--  put fictional locations into a regulated chain-of-custody record.
--  Fill them in before go-live.
-- =============================================================

do $$
declare mt uuid;
begin
  select core.tenant_id('melrah') into mt;
  if mt is null then
    raise notice 'melrah tenant not found — skipping hub seed';
    return;
  end if;

  insert into melrah.hub (tenant_id, code, name, city, state, region, active) values
    (mt, 'HUB-PDX', 'Portland Consolidation Hub',  'Portland',   'OR', 'Pacific Northwest — Metro',   true),
    (mt, 'HUB-SEA', 'Puget Sound Consolidation Hub','Seattle',   'WA', 'Pacific Northwest — Sound',   true),
    (mt, 'HUB-DFW', 'North Texas Consolidation Hub','Dallas',    'TX', 'Texas — North',               true),
    (mt, 'HUB-AUS', 'Central Texas Consolidation Hub','Austin',  'TX', 'Texas — Central',             true)
  on conflict (code) do nothing;

  -- Assign existing facilities to the nearest hub by state/metro.
  update melrah.facility f set hub_id = h.id
  from melrah.hub h
  where f.hub_id is null
    and h.code = case
      when f.state = 'OR' then 'HUB-PDX'
      when f.state = 'WA' then 'HUB-SEA'
      when f.state = 'TX' and f.city = 'Austin' then 'HUB-AUS'
      when f.state = 'TX' then 'HUB-DFW'
    end;
end $$;


-- =============================================================
--  9. VERIFICATION
-- =============================================================
-- select code, name, city, state, region from melrah.hub order by code;
-- select facility_name, capture_rate_pct, yield_rate_pct,
--        collection_loss_qty, viability_loss_qty from melrah.v_facility_capture;
-- select wo_number, visit_count, hours_on_site, miles_traveled, invoiced
--   from melrah.v_work_order_billing order by wo_number;
