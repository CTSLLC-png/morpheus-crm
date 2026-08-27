// src/modules/melrah/data.js
// ── Melrah Environmental — operations data access ──────────────
// Melrah runs medical device reprocessing: it collects used devices
// from participating healthcare facilities, reprocesses them, runs QC
// and releases them back. This module reads the logistics side of that
// — work orders, custody, lots, nonconformances.
//
// The melrah schema is not exposed by PostgREST, so everything here
// reads the `ml_*` passthrough views in `public`. Those are plain views
// over tables in another schema, so joins are resolved with a second
// query rather than through PostgREST resource embedding — the same
// approach src/lib/platform.js takes for `core_*`, and for the same
// reason: embedding across passthrough views depends on relationship
// inference we cannot rely on.
//
// Reads only. Nothing in this file writes to the database.

import { supabase } from '../../lib/supabase.js'

const WORK_ORDER_COLUMNS =
  'id, tenant_id, wo_number, account_id, facility_id, wo_type, status, ' +
  'scheduled_for, route, assigned_to, batch_id, created_at, closed_at'
const ACCOUNT_COLUMNS =
  'id, tenant_id, name, network_type, stage, owner_id, region, est_annual_volume, notes'
const FACILITY_COLUMNS =
  'id, account_id, name, address, city, state, postal_code, contact_name, ' +
  'contact_email, contact_phone, collection_frequency, active'
const DEVICE_COLUMNS =
  'id, sku, description, oem, category, reprocessable, fda_clearance, max_cycles, active'
const LOT_COLUMNS =
  'id, lot_number, work_order_id, device_id, qty_received, qty_released, ' +
  'cycle_number, status, received_at, released_at'
const LOT_STATUS_COLUMNS =
  'id, lot_number, status, qty_received, qty_released, cycle_number, sku, device, ' +
  'account, wo_number, latest_disposition, last_inspected, open_critical_ncrs'
const NCR_COLUMNS =
  'id, ncr_number, lot_id, work_order_id, raised_at, raised_by, severity, ' +
  'description, capa_ref, status, closed_at'

/** Work order statuses that still represent live operational work. */
const CLOSED_WORK_ORDER_STATUSES = ['CLOSED', 'CANCELLED']

// ── DEMO DATA ──────────────────────────────────────────────────
// The seeded Melrah rows are prefixed `DEMO` (`DEMO-WO-1001`,
// `DEMO — Cascade Valley Health Partners`). Nothing else marks them,
// so the console detects them from the values themselves rather than
// assuming a whole environment is demo.

/** True when a value carries the `DEMO` seed prefix. */
export function isDemoValue(value) {
  return typeof value === 'string' && /^DEMO[\s–—-]/.test(value)
}

/**
 * How many of `values` carry the demo prefix, so a view can say
 * honestly whether what is on screen is seeded data.
 * Returns { demo, total } — both counted, never assumed.
 */
export function summarizeDemo(values) {
  const list = (values ?? []).filter(v => typeof v === 'string' && v.length > 0)
  return { demo: list.filter(isDemoValue).length, total: list.length }
}

// ── PRIMITIVES ─────────────────────────────────────────────────

export async function listWorkOrders() {
  const { data, error } = await supabase
    .from('ml_work_order')
    .select(WORK_ORDER_COLUMNS)
    .order('scheduled_for', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function listAccounts() {
  const { data, error } = await supabase
    .from('ml_account')
    .select(ACCOUNT_COLUMNS)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function listFacilities() {
  const { data, error } = await supabase
    .from('ml_facility')
    .select(FACILITY_COLUMNS)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function listDevices() {
  const { data, error } = await supabase
    .from('ml_device')
    .select(DEVICE_COLUMNS)
    .order('sku')
  if (error) throw error
  return data ?? []
}

export async function listLotStatus() {
  const { data, error } = await supabase
    .from('ml_lot_status')
    .select(LOT_STATUS_COLUMNS)
    .order('lot_number')
  if (error) throw error
  return data ?? []
}

// ── LOOKUPS BY ID ──────────────────────────────────────────────
// Each returns a Map keyed by id. An empty id list short-circuits so a
// `.in()` with no values is never sent.

async function accountsById(ids) {
  const wanted = uniqueIds(ids)
  if (!wanted.length) return new Map()
  const { data, error } = await supabase
    .from('ml_account')
    .select(ACCOUNT_COLUMNS)
    .in('id', wanted)
  if (error) throw error
  return indexBy(data ?? [], 'id')
}

async function facilitiesById(ids) {
  const wanted = uniqueIds(ids)
  if (!wanted.length) return new Map()
  const { data, error } = await supabase
    .from('ml_facility')
    .select(FACILITY_COLUMNS)
    .in('id', wanted)
  if (error) throw error
  return indexBy(data ?? [], 'id')
}

async function devicesById(ids) {
  const wanted = uniqueIds(ids)
  if (!wanted.length) return new Map()
  const { data, error } = await supabase
    .from('ml_device')
    .select(DEVICE_COLUMNS)
    .in('id', wanted)
  if (error) throw error
  return indexBy(data ?? [], 'id')
}

async function linesForWorkOrders(workOrderIds) {
  const wanted = uniqueIds(workOrderIds)
  if (!wanted.length) return []
  const { data, error } = await supabase
    .from('ml_work_order_line')
    .select('id, work_order_id, device_id, expected_qty, received_qty')
    .in('work_order_id', wanted)
  if (error) throw error
  return data ?? []
}

// ── WORK ORDERS ────────────────────────────────────────────────

/**
 * Every work order the caller can see, with its account and facility
 * joined and its line quantities rolled up. `assigned_to` is a uuid
 * with no user table to join to, so it is passed through unchanged.
 */
export async function getWorkOrders() {
  const workOrders = await listWorkOrders()
  if (!workOrders.length) return []

  const [accounts, facilities, lines] = await Promise.all([
    accountsById(workOrders.map(w => w.account_id)),
    facilitiesById(workOrders.map(w => w.facility_id)),
    linesForWorkOrders(workOrders.map(w => w.id)),
  ])

  const linesByWorkOrder = groupBy(lines, 'work_order_id')

  return workOrders.map(wo => {
    const own = linesByWorkOrder.get(wo.id) ?? []
    return {
      ...wo,
      account:  accounts.get(wo.account_id) ?? null,
      facility: facilities.get(wo.facility_id) ?? null,
      line_count:    own.length,
      expected_qty:  sumOf(own, 'expected_qty'),
      // Null received_qty means "not counted in yet", not zero received.
      received_qty:  own.some(l => l.received_qty != null) ? sumOf(own, 'received_qty') : null,
    }
  })
}

/**
 * One work order and everything hanging off it: account, facility,
 * lines with their devices, the custody chain in chronological order,
 * lots with their QC roll-up, and nonconformances.
 * Returns null when the id matches no visible work order.
 */
export async function getWorkOrderDetail(workOrderId) {
  if (!workOrderId) return null

  const { data: workOrder, error } = await supabase
    .from('ml_work_order')
    .select(WORK_ORDER_COLUMNS)
    .eq('id', workOrderId)
    .maybeSingle()
  if (error) throw error
  if (!workOrder) return null

  const [accounts, facilities, lines, custodyEvents, lots, ncrs] = await Promise.all([
    accountsById([workOrder.account_id]),
    facilitiesById([workOrder.facility_id]),
    linesForWorkOrders([workOrder.id]),
    getCustodyEvents(workOrder.id),
    getLotsForWorkOrder(workOrder.id),
    getNonconformancesForWorkOrder(workOrder.id),
  ])

  const devices = await devicesById(lines.map(l => l.device_id))

  return {
    ...workOrder,
    account:  accounts.get(workOrder.account_id) ?? null,
    facility: facilities.get(workOrder.facility_id) ?? null,
    lines: lines.map(l => ({ ...l, device: devices.get(l.device_id) ?? null })),
    custody_events: custodyEvents,
    lots,
    nonconformances: ncrs,
    line_count:   lines.length,
    expected_qty: sumOf(lines, 'expected_qty'),
    received_qty: lines.some(l => l.received_qty != null) ? sumOf(lines, 'received_qty') : null,
  }
}

/** The custody chain for one work order, oldest event first. */
export async function getCustodyEvents(workOrderId) {
  const { data, error } = await supabase
    .from('ml_custody_event')
    .select('id, work_order_id, event_type, occurred_at, actor, location, seal_number, note')
    .eq('work_order_id', workOrderId)
    .order('occurred_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * Lots created from one work order, each merged with its row in the
 * denormalized `ml_lot_status` view (latest disposition, last
 * inspection, open critical NCR count) and its device record.
 */
export async function getLotsForWorkOrder(workOrderId) {
  const { data, error } = await supabase
    .from('ml_lot')
    .select(LOT_COLUMNS)
    .eq('work_order_id', workOrderId)
    .order('lot_number', { ascending: true })
  if (error) throw error

  const lots = data ?? []
  if (!lots.length) return []

  const [statuses, devices] = await Promise.all([
    lotStatusById(lots.map(l => l.id)),
    devicesById(lots.map(l => l.device_id)),
  ])

  return lots.map(lot => {
    const rollup = statuses.get(lot.id) ?? null
    return {
      ...lot,
      device: devices.get(lot.device_id) ?? null,
      latest_disposition: rollup?.latest_disposition ?? null,
      last_inspected:     rollup?.last_inspected ?? null,
      open_critical_ncrs: rollup?.open_critical_ncrs ?? null,
    }
  })
}

async function lotStatusById(ids) {
  const wanted = uniqueIds(ids)
  if (!wanted.length) return new Map()
  const { data, error } = await supabase
    .from('ml_lot_status')
    .select(LOT_STATUS_COLUMNS)
    .in('id', wanted)
  if (error) throw error
  return indexBy(data ?? [], 'id')
}

/** Nonconformances raised against one work order, newest first. */
export async function getNonconformancesForWorkOrder(workOrderId) {
  const { data, error } = await supabase
    .from('ml_nonconformance')
    .select(NCR_COLUMNS)
    .eq('work_order_id', workOrderId)
    .order('raised_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// ── NETWORK: ACCOUNTS + FACILITIES ─────────────────────────────

/**
 * The participating provider network: accounts and the facilities under
 * them, each with its own work-order counts. A facility with no work
 * orders comes back with zero counts and a null last_scheduled_for —
 * callers render that as an empty state rather than hiding the row.
 */
export async function getNetwork() {
  const [accounts, facilities, workOrders] = await Promise.all([
    listAccounts(),
    listFacilities(),
    listWorkOrders(),
  ])

  const byFacility = groupBy(workOrders, 'facility_id')
  const byAccount  = groupBy(workOrders, 'account_id')
  const accountsById_ = indexBy(accounts, 'id')

  const enrichedFacilities = facilities.map(f => {
    const own = byFacility.get(f.id) ?? []
    return {
      ...f,
      account: accountsById_.get(f.account_id) ?? null,
      work_order_count: own.length,
      open_work_order_count: own.filter(isOpenWorkOrder).length,
      last_scheduled_for: latestDate(own.map(w => w.scheduled_for)),
    }
  })

  const facilitiesByAccount = groupBy(enrichedFacilities, 'account_id')

  const enrichedAccounts = accounts.map(a => {
    const own = byAccount.get(a.id) ?? []
    return {
      ...a,
      facility_count: (facilitiesByAccount.get(a.id) ?? []).length,
      work_order_count: own.length,
      open_work_order_count: own.filter(isOpenWorkOrder).length,
    }
  })

  return { accounts: enrichedAccounts, facilities: enrichedFacilities }
}

// ── DASHBOARD ROLLUPS ──────────────────────────────────────────

/** A work order is open until it is CLOSED or CANCELLED. */
export function isOpenWorkOrder(workOrder) {
  return !CLOSED_WORK_ORDER_STATUSES.includes(workOrder?.status)
}

/**
 * The dispatch board's summary figures. Every number is counted from
 * rows returned by these queries — nothing here is a constant.
 *
 *   openWorkOrders   work orders not yet CLOSED or CANCELLED
 *   inTransit        work orders with status IN_TRANSIT
 *   lotsAwaitingQc   lots with no QC inspection recorded against them
 *                    (`ml_lot_status.last_inspected` is null)
 *   openNcrs         nonconformances with no closed_at
 *
 * `statusCounts` carries the live count per work order status so the
 * board can build its filters from what actually exists.
 */
export async function getDispatchRollup() {
  const [workOrderRes, lotRes, ncrRes] = await Promise.all([
    supabase.from('ml_work_order').select('id, status'),
    supabase.from('ml_lot_status').select('id, status, last_inspected'),
    supabase.from('ml_nonconformance').select('id, closed_at, severity'),
  ])
  if (workOrderRes.error) throw workOrderRes.error
  if (lotRes.error) throw lotRes.error
  if (ncrRes.error) throw ncrRes.error

  const workOrders = workOrderRes.data ?? []
  const lots       = lotRes.data ?? []
  const ncrs       = ncrRes.data ?? []

  const statusCounts = {}
  for (const wo of workOrders) {
    const key = wo.status ?? 'UNKNOWN'
    statusCounts[key] = (statusCounts[key] ?? 0) + 1
  }

  const openNcrList = ncrs.filter(n => n.closed_at == null)

  return {
    totalWorkOrders: workOrders.length,
    openWorkOrders:  workOrders.filter(isOpenWorkOrder).length,
    inTransit:       workOrders.filter(w => w.status === 'IN_TRANSIT').length,
    totalLots:       lots.length,
    lotsAwaitingQc:  lots.filter(l => l.last_inspected == null).length,
    openNcrs:        openNcrList.length,
    openCriticalNcrs: openNcrList.filter(n => n.severity === 'CRITICAL').length,
    statusCounts,
  }
}

// ── HELPERS ────────────────────────────────────────────────────

function uniqueIds(ids) {
  return [...new Set((ids ?? []).filter(Boolean))]
}

function indexBy(rows, key) {
  return new Map((rows ?? []).map(r => [r[key], r]))
}

function groupBy(rows, key) {
  const out = new Map()
  for (const row of rows ?? []) {
    const k = row[key]
    if (k == null) continue
    const bucket = out.get(k)
    if (bucket) bucket.push(row)
    else out.set(k, [row])
  }
  return out
}

function sumOf(rows, key) {
  return (rows ?? []).reduce((total, row) => total + (row[key] ?? 0), 0)
}

function latestDate(values) {
  const dates = (values ?? []).filter(Boolean).sort()
  return dates.length ? dates[dates.length - 1] : null
}
