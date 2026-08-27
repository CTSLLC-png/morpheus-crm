// src/modules/melrah/MelrahConsole.jsx
// ── Melrah Environmental — operations console ──────────────────
// Melrah collects used medical devices from participating healthcare
// facilities, reprocesses them, runs QC and releases them back. This
// console covers the logistics side of that work: dispatching work
// orders, following the chain of custody, and the provider network the
// devices come from.
//
// Three views, routed internally under /m/<module key>:
//   · dispatch board      — summary + the work order list
//   · work order detail   — custody timeline + related lists
//   · facilities          — the participating provider network
//
// Every figure on screen is counted from query results. Nothing is
// hardcoded; where a value cannot be derived the element is omitted
// rather than filled in.

import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useParams } from 'react-router-dom'
import {
  getWorkOrders,
  getWorkOrderDetail,
  getNetwork,
  getDispatchRollup,
  summarizeDemo,
} from './data.js'

/** Module keys this console serves, and the view each one opens. */
export const MELRAH_MODULE_VIEWS = {
  'logistics.workorders': 'dispatch',
  'logistics.accounts':   'facilities',
}

/**
 * The view a module key opens here, or null when this console does not
 * serve it — the caller then keeps the generic placeholder. Own-property
 * check so a registry key that collides with an Object.prototype member
 * cannot claim a view it has no entry for.
 */
export function melrahViewFor(moduleKey) {
  return Object.prototype.hasOwnProperty.call(MELRAH_MODULE_VIEWS, moduleKey)
    ? MELRAH_MODULE_VIEWS[moduleKey]
    : null
}

/** Work order statuses in operational order; anything else is appended. */
const STATUS_ORDER = ['DRAFT', 'IN_TRANSIT', 'RECEIVED', 'RELEASED', 'CLOSED', 'CANCELLED']

// ── Tone palette — reuses the pill colours already in the app ──
const TONES = {
  neutral: { background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' },
  blue:    { background: '#E6F1FB', color: '#0C447C' },
  green:   { background: '#E1F5EE', color: '#0F6E56' },
  purple:  { background: '#EEEDFE', color: '#3C3489' },
  red:     { background: '#FAECE7', color: '#993C1D' },
}
const WO_STATUS_TONE  = { DRAFT:'neutral', IN_TRANSIT:'blue', RECEIVED:'purple', RELEASED:'green', CLOSED:'neutral', CANCELLED:'red' }
const LOT_STATUS_TONE = { QUARANTINE:'blue', ON_HOLD:'purple', RELEASED:'green', REJECTED:'red' }
const NCR_STATUS_TONE = { OPEN:'red', INVESTIGATING:'purple', CLOSED:'green' }
const SEVERITY_TONE   = { CRITICAL:'red', MAJOR:'purple', MINOR:'neutral' }
const DISPOSITION_TONE= { ACCEPT:'green', REWORK:'purple', REJECT:'red' }

export default function MelrahConsole({ moduleKey, module: mod, modules = [], tenant }) {
  const navigate = useNavigate()
  const base = `/m/${moduleKey}`
  const view = melrahViewFor(moduleKey) ?? 'dispatch'

  const board   = useAsync(loadBoard, [])
  const network = useAsync(getNetwork, [])

  // Tabs are the Melrah services actually enabled for this tenant, so
  // a tenant with only one of them never sees a dead link.
  const tabs = modules.filter(candidate => melrahViewFor(candidate.key))

  return (
    <div style={m.page}>
      <div style={m.headerRow}>
        <div>
          <div style={m.eyebrow}>
            {tenant?.name ?? 'Melrah Environmental'}
            {mod?.category ? ` · ${mod.category}` : ''}
          </div>
          <div style={m.title}>{mod?.name ?? 'Operations console'}</div>
          <div style={m.sub}>
            {view === 'facilities'
              ? 'Participating healthcare facilities and the accounts they belong to.'
              : 'Device collection, custody and reprocessing work orders.'}
          </div>
        </div>
      </div>

      {tabs.length > 1 && (
        <div style={m.tabRow}>
          {tabs.map(t => (
            <button
              key={t.key}
              style={{ ...m.tab, ...(t.key === moduleKey ? m.tabActive : {}) }}
              onClick={() => navigate(`/m/${t.key}`)}>
              {t.name}
            </button>
          ))}
        </div>
      )}

      <Routes>
        <Route
          index
          element={view === 'facilities'
            ? <FacilitiesView network={network} />
            : <DispatchBoard board={board} onOpen={id => navigate(`${base}/wo/${id}`)} />}
        />
        <Route path="wo/:woId" element={<WorkOrderDetail base={base} />} />
        <Route path="*" element={<UnknownRoute onBack={() => navigate(base)} />} />
      </Routes>
    </div>
  )
}

function loadBoard() {
  return Promise.all([getWorkOrders(), getDispatchRollup()])
    .then(([workOrders, rollup]) => ({ workOrders, rollup }))
}

// ── DISPATCH BOARD ─────────────────────────────────────────────

function DispatchBoard({ board, onOpen }) {
  const [statusFilter, setStatusFilter] = useState('ALL')

  if (board.status === 'loading') return <Loading label="Loading work orders…" />
  if (board.status === 'error')   return <ErrorState error={board.error} onRetry={board.reload} what="work orders" />

  const { workOrders, rollup } = board.data
  // Chip counts are tallied from the rows this table can actually show,
  // so a chip's number and its filtered list can never disagree.
  const listStatusCounts = tally(workOrders, w => w.status ?? 'UNKNOWN')
  const statuses = orderStatuses(Object.keys(listStatusCounts))
  const visible = statusFilter === 'ALL'
    ? workOrders
    : workOrders.filter(w => (w.status ?? 'UNKNOWN') === statusFilter)

  // Cards are built from counted values only. A figure that could not
  // be derived is dropped from the row instead of being invented.
  const cards = [
    { label: 'Open work orders', value: rollup.openWorkOrders,
      sub: `${rollup.totalWorkOrders} on file · open = not CLOSED or CANCELLED` },
    { label: 'In transit', value: rollup.inTransit,
      sub: 'work orders with status IN_TRANSIT' },
    { label: 'Lots awaiting QC', value: rollup.lotsAwaitingQc,
      sub: `of ${rollup.totalLots} lots · no inspection recorded` },
    { label: 'Open NCRs', value: rollup.openNcrs,
      sub: `${rollup.openCriticalNcrs} critical · open = not yet closed` },
  ].filter(c => Number.isFinite(c.value))

  return (
    <div>
      <DemoNotice values={workOrders.map(w => w.wo_number)} noun="work order" />

      {cards.length > 0 && (
        <div style={m.cardGrid}>
          {cards.map(c => (
            <div key={c.label} style={m.statCard}>
              <div style={m.statLabel}>{c.label}</div>
              <div style={m.statValue}>{c.value.toLocaleString()}</div>
              <div style={m.statSub}>{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      {workOrders.length > 0 && (
        <div style={m.filterRow}>
          <FilterChip
            label="All" count={workOrders.length}
            active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} />
          {statuses.map(st => (
            <FilterChip
              key={st} label={spaced(st)} count={listStatusCounts[st]}
              active={statusFilter === st} onClick={() => setStatusFilter(st)} />
          ))}
        </div>
      )}

      <DataTable
        rows={visible}
        rowKey={w => w.id}
        onRowClick={w => onOpen(w.id)}
        empty={workOrders.length === 0
          ? 'No work orders are visible for this organisation.'
          : `No work orders with status ${spaced(statusFilter)}.`}
        columns={[
          { key:'wo', label:'Work order', render: w => (
              <span style={m.mono}>{w.wo_number ?? '—'}</span>) },
          { key:'type', label:'Type', render: w => (
              <span style={m.quiet}>{w.wo_type ? spaced(w.wo_type) : '—'}</span>) },
          { key:'facility', label:'Facility', render: w => (
              <>
                <div style={m.cellStrong}>{w.facility?.name ?? 'Facility not linked'}</div>
                <div style={m.cellSub}>{w.account?.name ?? 'Account not linked'}</div>
              </>) },
          { key:'where', label:'Location', render: w => (
              <span style={m.quiet}>{cityState(w.facility) ?? '—'}</span>) },
          { key:'route', label:'Route', render: w => (
              <span style={m.quiet}>{w.route ?? '—'}</span>) },
          { key:'scheduled', label:'Scheduled', render: w => (
              <span style={m.quiet}>{formatDay(w.scheduled_for)}</span>) },
          { key:'expected', label:'Expected', align:'right', render: w => (
              <span style={m.mono}>{w.line_count ? w.expected_qty.toLocaleString() : '—'}</span>) },
          { key:'received', label:'Received', align:'right', render: w => (
              w.received_qty == null
                ? <span style={m.cellSub}>not counted</span>
                : <span style={{ ...m.mono, color: w.received_qty < w.expected_qty ? '#993C1D' : '#0F6E56' }}>
                    {w.received_qty.toLocaleString()}
                  </span>) },
          { key:'status', label:'Status', render: w => (
              <Pill tone={WO_STATUS_TONE[w.status] ?? 'neutral'}>{w.status ? spaced(w.status) : 'UNKNOWN'}</Pill>) },
        ]}
      />
    </div>
  )
}

// ── WORK ORDER DETAIL ──────────────────────────────────────────

function WorkOrderDetail({ base }) {
  const { woId } = useParams()
  const navigate = useNavigate()
  const load = useCallback(() => getWorkOrderDetail(woId), [woId])
  const detail = useAsync(load, [woId])

  if (detail.status === 'loading') return <Loading label="Loading work order…" />
  if (detail.status === 'error')   return <ErrorState error={detail.error} onRetry={detail.reload} what="this work order" />

  const wo = detail.data
  if (!wo) {
    return (
      <div style={m.card}>
        <div style={m.cardTitle}>Work order not found</div>
        <p style={m.body}>
          No work order with that id is visible to you. It may belong to another organisation,
          or it may have been removed.
        </p>
        <button style={m.linkBtn} onClick={() => navigate(base)}>← Back to the dispatch board</button>
      </div>
    )
  }

  const variance = wo.received_qty == null ? null : wo.received_qty - wo.expected_qty

  return (
    <div>
      <button style={m.linkBtn} onClick={() => navigate(base)}>← Dispatch board</button>

      <DemoNotice
        values={[wo.wo_number, wo.account?.name, wo.facility?.name]}
        noun="record on this page"
        nounPlural="records on this page"
      />

      <div style={{ ...m.card, marginTop: '10px' }}>
        <div style={m.detailHead}>
          <div>
            <div style={m.eyebrow}>{wo.wo_type ? spaced(wo.wo_type) : 'Work order'}</div>
            <div style={m.detailTitle}>{wo.wo_number ?? 'Untitled work order'}</div>
            <div style={m.sub}>
              {wo.facility?.name ?? 'Facility not linked'}
              {' · '}
              {wo.account?.name ?? 'Account not linked'}
            </div>
          </div>
          <Pill tone={WO_STATUS_TONE[wo.status] ?? 'neutral'} large>
            {wo.status ? spaced(wo.status) : 'UNKNOWN'}
          </Pill>
        </div>

        <div style={m.divider} />

        <div style={m.metaGrid}>
          <Meta label="Scheduled for" value={formatDay(wo.scheduled_for)} />
          <Meta label="Route" value={wo.route ?? '—'} />
          <Meta label="Facility address" value={facilityAddress(wo.facility) ?? '—'} />
          <Meta label="Facility contact" value={wo.facility?.contact_name ?? '—'}
                sub={wo.facility?.contact_email ?? wo.facility?.contact_phone ?? null} />
          <Meta label="Collection frequency" value={wo.facility?.collection_frequency ? spaced(wo.facility.collection_frequency) : '—'} />
          <Meta label="Created" value={formatMoment(wo.created_at)} />
          <Meta label="Closed" value={wo.closed_at ? formatMoment(wo.closed_at) : 'Not closed'} />
          {/* assigned_to and batch_id are uuids with no user or batch
              record reachable from here, so they are shown as stored. */}
          <Meta label="Assigned to (user id)"
                value={wo.assigned_to ? <code style={m.code}>{wo.assigned_to}</code> : 'Unassigned'} />
          {wo.batch_id && <Meta label="Batch id" value={<code style={m.code}>{wo.batch_id}</code>} />}
        </div>

        <div style={m.divider} />

        <div style={m.qtyStrip}>
          <QtyFigure label="Lines" value={wo.line_count.toLocaleString()} />
          <QtyFigure label="Expected units" value={wo.line_count ? wo.expected_qty.toLocaleString() : '—'} />
          <QtyFigure
            label="Received units"
            value={wo.received_qty == null ? 'Not counted in' : wo.received_qty.toLocaleString()} />
          {variance != null && (
            <QtyFigure
              label="Variance"
              value={`${variance > 0 ? '+' : ''}${variance.toLocaleString()}`}
              tone={variance < 0 ? '#993C1D' : variance > 0 ? '#BA7517' : '#0F6E56'} />
          )}
        </div>
      </div>

      <CustodyTimeline events={wo.custody_events} woNumber={wo.wo_number} />

      <RelatedList title="Work order lines" count={wo.lines.length}>
        <DataTable
          rows={wo.lines}
          rowKey={l => l.id}
          empty="This work order has no lines. Nothing has been scheduled for collection on it."
          columns={[
            { key:'sku', label:'SKU', render: l => <span style={m.mono}>{l.device?.sku ?? '—'}</span> },
            { key:'device', label:'Device', render: l => (
                <>
                  <div style={m.cellStrong}>{l.device?.description ?? 'Device not linked'}</div>
                  <div style={m.cellSub}>
                    {[l.device?.oem, l.device?.category].filter(Boolean).join(' · ') || '—'}
                  </div>
                </>) },
            { key:'cycles', label:'Max cycles', align:'right', render: l => (
                <span style={m.mono}>{l.device?.max_cycles ?? '—'}</span>) },
            { key:'expected', label:'Expected', align:'right', render: l => (
                <span style={m.mono}>{l.expected_qty?.toLocaleString() ?? '—'}</span>) },
            { key:'received', label:'Received', align:'right', render: l => (
                l.received_qty == null
                  ? <span style={m.cellSub}>not counted</span>
                  : <span style={{ ...m.mono, color: l.received_qty < (l.expected_qty ?? 0) ? '#993C1D' : '#0F6E56' }}>
                      {l.received_qty.toLocaleString()}
                    </span>) },
          ]}
        />
      </RelatedList>

      <RelatedList title="Lots" count={wo.lots.length}>
        <DataTable
          rows={wo.lots}
          rowKey={l => l.id}
          empty="No lots have been created from this work order yet. Lots are opened when a shipment is received."
          columns={[
            { key:'lot', label:'Lot', render: l => <span style={m.mono}>{l.lot_number ?? '—'}</span> },
            { key:'sku', label:'Device', render: l => (
                <>
                  <div style={m.cellStrong}>{l.device?.sku ?? '—'}</div>
                  <div style={m.cellSub}>{l.device?.description ?? 'Device not linked'}</div>
                </>) },
            { key:'cycle', label:'Cycle', align:'right', render: l => (
                <span style={m.mono}>
                  {l.cycle_number ?? '—'}{l.device?.max_cycles ? ` / ${l.device.max_cycles}` : ''}
                </span>) },
            { key:'qty', label:'Received / released', align:'right', render: l => (
                <span style={m.mono}>
                  {l.qty_received?.toLocaleString() ?? '—'}
                  {' / '}
                  {l.qty_released == null ? '—' : l.qty_released.toLocaleString()}
                </span>) },
            { key:'qc', label:'Last QC', render: l => (
                l.last_inspected
                  ? <>
                      <div style={m.cellStrong}>
                        {l.latest_disposition
                          ? <Pill tone={DISPOSITION_TONE[l.latest_disposition] ?? 'neutral'}>{spaced(l.latest_disposition)}</Pill>
                          : '—'}
                      </div>
                      <div style={m.cellSub}>{formatMoment(l.last_inspected)}</div>
                    </>
                  : <span style={m.cellSub}>not inspected</span>) },
            { key:'ncr', label:'Open critical NCRs', align:'right', render: l => (
                l.open_critical_ncrs == null
                  ? <span style={m.cellSub}>—</span>
                  : <span style={{ ...m.mono, color: l.open_critical_ncrs > 0 ? '#993C1D' : 'var(--color-text-tertiary)' }}>
                      {l.open_critical_ncrs.toLocaleString()}
                    </span>) },
            { key:'status', label:'Status', render: l => (
                <Pill tone={LOT_STATUS_TONE[l.status] ?? 'neutral'}>{l.status ? spaced(l.status) : 'UNKNOWN'}</Pill>) },
          ]}
        />
      </RelatedList>

      <RelatedList title="Nonconformances" count={wo.nonconformances.length}>
        <DataTable
          rows={wo.nonconformances}
          rowKey={n => n.id}
          empty="No nonconformances have been raised against this work order."
          columns={[
            { key:'ncr', label:'NCR', render: n => <span style={m.mono}>{n.ncr_number ?? '—'}</span> },
            { key:'severity', label:'Severity', render: n => (
                <Pill tone={SEVERITY_TONE[n.severity] ?? 'neutral'}>{n.severity ? spaced(n.severity) : '—'}</Pill>) },
            { key:'raised', label:'Raised', render: n => (
                <>
                  <div style={m.cellStrong}>{formatMoment(n.raised_at)}</div>
                  <div style={m.cellSub}>{n.raised_by ?? 'Raiser not recorded'}</div>
                </>) },
            { key:'desc', label:'Description', render: n => (
                <span style={m.wrap}>{n.description ?? '—'}</span>) },
            { key:'capa', label:'CAPA', render: n => (
                <span style={m.mono}>{n.capa_ref ?? '—'}</span>) },
            { key:'status', label:'Status', render: n => (
                <>
                  <Pill tone={NCR_STATUS_TONE[n.status] ?? 'neutral'}>{n.status ? spaced(n.status) : 'UNKNOWN'}</Pill>
                  <div style={m.cellSub}>{n.closed_at ? `closed ${formatMoment(n.closed_at)}` : 'open'}</div>
                </>) },
          ]}
        />
      </RelatedList>
    </div>
  )
}

/** The chain of custody, oldest event first. */
function CustodyTimeline({ events, woNumber }) {
  return (
    <div style={{ ...m.card, marginTop: '12px' }}>
      <div style={m.cardTitle}>
        Chain of custody{events.length > 0 ? ` (${events.length})` : ''}
      </div>

      {events.length === 0 ? (
        <div style={m.emptyBox}>
          No custody events have been recorded for {woNumber ?? 'this work order'}. Nothing has been
          sealed, picked up or received against it yet.
        </div>
      ) : (
        <div style={m.timeline}>
          {events.map((e, i) => {
            const exception = e.event_type === 'EXCEPTION'
            return (
              <div key={e.id ?? `${e.occurred_at}-${i}`} style={m.timelineRow}>
                <div style={m.timelineRail}>
                  <div style={{ ...m.timelineDot, background: exception ? '#993C1D' : '#5DCAA5' }} />
                  {i < events.length - 1 && <div style={m.timelineLine} />}
                </div>
                <div style={m.timelineBody}>
                  <div style={m.timelineHead}>
                    <span style={{ ...m.timelineType, color: exception ? '#993C1D' : 'var(--color-text-primary)' }}>
                      {e.event_type ? spaced(e.event_type) : 'EVENT'}
                    </span>
                    <span style={m.timelineWhen}>{formatMoment(e.occurred_at)}</span>
                  </div>
                  <div style={m.timelineMeta}>
                    <span>{e.actor ?? 'Actor not recorded'}</span>
                    <span style={m.dotSep}>·</span>
                    <span>{e.location ?? 'Location not recorded'}</span>
                    {e.seal_number && (
                      <>
                        <span style={m.dotSep}>·</span>
                        <span style={m.sealChip}>seal {e.seal_number}</span>
                      </>
                    )}
                  </div>
                  {e.note && <div style={m.timelineNote}>{e.note}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── FACILITIES / PROVIDER NETWORK ──────────────────────────────

function FacilitiesView({ network }) {
  if (network.status === 'loading') return <Loading label="Loading the provider network…" />
  if (network.status === 'error')   return <ErrorState error={network.error} onRetry={network.reload} what="the provider network" />

  const { accounts, facilities } = network.data

  return (
    <div>
      <DemoNotice
        values={[...facilities.map(f => f.name), ...accounts.map(a => a.name)]}
        noun="account and facility record"
        nounPlural="account and facility records"
      />

      <RelatedList title="Accounts" count={accounts.length}>
        <DataTable
          rows={accounts}
          rowKey={a => a.id}
          empty="No accounts are visible for this organisation."
          columns={[
            { key:'name', label:'Account', render: a => (
                <>
                  <div style={m.cellStrong}>{a.name ?? '—'}</div>
                  <div style={m.cellSub}>{a.network_type ? spaced(a.network_type) : 'Network type not set'}</div>
                </>) },
            { key:'region', label:'Region', render: a => <span style={m.quiet}>{a.region ?? '—'}</span> },
            { key:'stage', label:'Stage', render: a => (
                <Pill tone={a.stage === 'ACTIVE' ? 'green' : 'blue'}>{a.stage ? spaced(a.stage) : 'UNKNOWN'}</Pill>) },
            { key:'volume', label:'Est. annual units', align:'right', render: a => (
                <span style={m.mono}>{a.est_annual_volume == null ? '—' : a.est_annual_volume.toLocaleString()}</span>) },
            { key:'facilities', label:'Facilities', align:'right', render: a => (
                <span style={m.mono}>{a.facility_count.toLocaleString()}</span>) },
            { key:'wos', label:'Work orders', align:'right', render: a => (
                <span style={m.mono}>
                  {a.work_order_count.toLocaleString()}
                  <span style={m.cellSub}> · {a.open_work_order_count.toLocaleString()} open</span>
                </span>) },
          ]}
        />
      </RelatedList>

      <RelatedList title="Participating facilities" count={facilities.length}>
        <DataTable
          rows={facilities}
          rowKey={f => f.id}
          empty="No participating facilities are visible for this organisation."
          columns={[
            { key:'name', label:'Facility', render: f => (
                <>
                  <div style={m.cellStrong}>{f.name ?? '—'}</div>
                  <div style={m.cellSub}>{f.account?.name ?? 'Account not linked'}</div>
                </>) },
            { key:'where', label:'Location', render: f => (
                <>
                  <div style={m.cellStrong}>{cityState(f) ?? '—'}</div>
                  <div style={m.cellSub}>{[f.address, f.postal_code].filter(Boolean).join(', ') || '—'}</div>
                </>) },
            { key:'freq', label:'Collection', render: f => (
                f.collection_frequency
                  ? <Pill tone="blue">{spaced(f.collection_frequency)}</Pill>
                  : <span style={m.cellSub}>not set</span>) },
            { key:'contact', label:'Contact', render: f => (
                f.contact_name || f.contact_email || f.contact_phone
                  ? <>
                      <div style={m.cellStrong}>{f.contact_name ?? '—'}</div>
                      <div style={m.cellSub}>{[f.contact_email, f.contact_phone].filter(Boolean).join(' · ') || '—'}</div>
                    </>
                  : <span style={m.cellSub}>no contact on file</span>) },
            { key:'wos', label:'Work orders', align:'right', render: f => (
                f.work_order_count === 0
                  ? <span style={m.cellSub}>none yet</span>
                  : <span style={m.mono}>
                      {f.work_order_count.toLocaleString()}
                      <span style={m.cellSub}> · {f.open_work_order_count.toLocaleString()} open</span>
                    </span>) },
            { key:'last', label:'Last scheduled', render: f => (
                <span style={m.quiet}>{f.last_scheduled_for ? formatDay(f.last_scheduled_for) : '—'}</span>) },
            { key:'active', label:'Status', render: f => (
                <Pill tone={f.active ? 'green' : 'neutral'}>{f.active ? 'ACTIVE' : 'INACTIVE'}</Pill>) },
          ]}
        />
      </RelatedList>
    </div>
  )
}

// ── SHARED PIECES ──────────────────────────────────────────────

function UnknownRoute({ onBack }) {
  return (
    <div style={m.card}>
      <div style={m.cardTitle}>Page not found</div>
      <p style={m.body}>That address does not match a view in this console.</p>
      <button style={m.linkBtn} onClick={onBack}>← Back</button>
    </div>
  )
}

function Loading({ label }) {
  return <div style={m.loading}>{label}</div>
}

function ErrorState({ error, onRetry, what }) {
  return (
    <div style={m.card}>
      <div style={m.cardTitle}>Could not load {what}</div>
      <div style={m.errorBox}>{error?.message ?? String(error ?? 'Unknown error')}</div>
      <p style={m.body}>
        Nothing is being shown in place of the missing data. Retry, or check that your account
        still has access to this service.
      </p>
      <button style={m.btnPrimary} onClick={onRetry}>Retry</button>
    </div>
  )
}

/**
 * Honest marker for seeded demo rows. Counts the `DEMO`-prefixed values
 * actually on screen; renders nothing when none are present.
 */
function DemoNotice({ values, noun, nounPlural }) {
  const { demo, total } = summarizeDemo(values)
  if (demo === 0) return null
  const plural = nounPlural ?? `${noun}s`
  return (
    <div style={m.demoNotice}>
      <span style={m.demoDot} />
      <span>
        <strong style={m.demoStrong}>Demo data.</strong>{' '}
        {demo === total
          ? `All ${total} ${total === 1 ? noun : plural} shown here are seeded demo records`
          : `${demo} of ${total} ${plural} shown here are seeded demo records`}
        {' '}(prefixed <code style={m.code}>DEMO</code>). This is not live operational data.
      </span>
    </div>
  )
}

function FilterChip({ label, count, active, onClick }) {
  return (
    <button style={{ ...m.chip, ...(active ? m.chipActive : {}) }} onClick={onClick}>
      {label}
      <span style={{ ...m.chipCount, ...(active ? m.chipCountActive : {}) }}>{count}</span>
    </button>
  )
}

function Pill({ tone = 'neutral', large = false, children }) {
  return (
    <span style={{ ...(large ? m.pillLarge : m.pill), ...(TONES[tone] ?? TONES.neutral) }}>
      {children}
    </span>
  )
}

function Meta({ label, value, sub }) {
  return (
    <div>
      <span style={m.metaLabel}>{label}</span>
      <div style={m.metaValue}>{value}</div>
      {sub && <div style={m.cellSub}>{sub}</div>}
    </div>
  )
}

function QtyFigure({ label, value, tone }) {
  return (
    <div>
      <div style={m.statLabel}>{label}</div>
      <div style={{ ...m.qtyValue, ...(tone ? { color: tone } : {}) }}>{value}</div>
    </div>
  )
}

function RelatedList({ title, count, children }) {
  return (
    <div style={{ marginTop: '18px' }}>
      <div style={{ ...m.cardTitle, marginBottom: '9px' }}>
        {title}{typeof count === 'number' ? ` (${count})` : ''}
      </div>
      {children}
    </div>
  )
}

/** A table that always renders something — rows, or a stated reason there are none. */
function DataTable({ columns, rows, rowKey, empty, onRowClick }) {
  const list = rows ?? []
  return (
    <div style={m.tableWrap}>
      <table style={m.table}>
        <thead>
          <tr style={m.theadRow}>
            {columns.map(c => (
              <th key={c.key} style={{ ...m.th, textAlign: c.align ?? 'left' }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((row, i) => (
            <tr
              key={rowKey ? rowKey(row) : i}
              style={{
                borderBottom: i < list.length - 1 ? '1px solid #F0F4F8' : 'none',
                cursor: onRowClick ? 'pointer' : 'default',
              }}
              onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map(c => (
                <td key={c.key} style={{ ...m.td, textAlign: c.align ?? 'left' }}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
          {list.length === 0 && (
            <tr>
              <td colSpan={columns.length} style={m.emptyCell}>{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── HOOKS + FORMATTING ─────────────────────────────────────────

/**
 * Runs an async loader and exposes an explicit loading / ready / error
 * state, so no view can end up blank while something failed silently.
 */
function useAsync(loader, deps) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading', data: null, error: null })
    Promise.resolve()
      .then(loader)
      .then(data => { if (!cancelled) setState({ status: 'ready', data, error: null }) })
      .catch(error => { if (!cancelled) setState({ status: 'error', data: null, error }) })
    return () => { cancelled = true }
    // `deps` is a fixed-length list per call site, and `loader` is
    // either a module-level function or already memoised by the caller.
  }, [...deps, attempt])

  const reload = useCallback(() => setAttempt(a => a + 1), [])
  return { ...state, reload }
}

/** Counts rows per key. Used for the status filter chips. */
function tally(rows, keyOf) {
  const counts = {}
  for (const row of rows ?? []) {
    const key = keyOf(row)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

/** STATUS_ORDER first, then anything unexpected the database returns. */
function orderStatuses(statuses) {
  const known = STATUS_ORDER.filter(s => statuses.includes(s))
  const extra = statuses.filter(s => !STATUS_ORDER.includes(s)).sort()
  return [...known, ...extra]
}

/** `IN_TRANSIT` → `IN TRANSIT`. Codes are shown as stored, just spaced. */
function spaced(value) {
  return typeof value === 'string' ? value.replace(/_/g, ' ') : String(value ?? '')
}

function cityState(place) {
  if (!place) return null
  const parts = [place.city, place.state].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function facilityAddress(facility) {
  if (!facility) return null
  const line = [facility.address, cityState(facility), facility.postal_code].filter(Boolean)
  return line.length ? line.join(', ') : null
}

/**
 * Date-only columns (`scheduled_for`) are read as calendar days, not
 * instants, so they are parsed by hand — `new Date('2026-07-13')` is
 * UTC midnight and slips a day in western time zones.
 */
function formatDay(value) {
  if (!value) return '—'
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (!parts) return String(value)
  const d = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatMoment(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ── STYLES ─────────────────────────────────────────────────────
// Same tokens as sh in TrainerShell.jsx and s in AdminPanel.jsx.

const m = {
  page:       { fontFamily: "'DM Sans', sans-serif", maxWidth: '1180px' },
  headerRow:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' },
  eyebrow:    { fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' },
  title:      { fontSize: '20px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '3px' },
  sub:        { fontSize: '13px', color: 'var(--color-text-secondary)' },
  body:       { fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text-secondary)', margin: '10px 0' },

  tabRow:     { display: 'flex', gap: '2px', marginBottom: '14px', background: 'var(--color-background-secondary)', borderRadius: '10px', padding: '3px', width: 'fit-content' },
  tab:        { padding: '6px 16px', border: 'none', borderRadius: '8px', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  tabActive:  { background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },

  card:       { background: 'var(--color-background-primary)', border: '1px solid #CBD8E6', borderRadius: '16px', padding: '22px' },
  cardTitle:  { fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '16px' },
  divider:    { height: '1px', background: '#F0F4F8', margin: '18px 0' },

  cardGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '16px' },
  statCard:   { background: 'var(--color-background-primary)', border: '1px solid #CBD8E6', borderRadius: '12px', padding: '16px' },
  statLabel:  { fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' },
  statValue:  { fontSize: '28px', fontWeight: 300, color: 'var(--color-text-primary)', fontFamily: 'monospace', lineHeight: 1 },
  statSub:    { fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '5px', lineHeight: 1.4 },

  filterRow:  { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' },
  chip:       { display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '6px 12px', borderRadius: '20px', border: '1px solid #CBD8E6', background: 'var(--color-background-primary)', color: 'var(--color-text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  chipActive: { background: '#0D1B2A', color: '#fff', border: '1px solid #0D1B2A' },
  chipCount:  { fontFamily: 'monospace', fontSize: '11px', color: 'var(--color-text-tertiary)' },
  chipCountActive: { color: '#5DCAA5' },

  tableWrap:  { overflowX: 'auto', border: '1px solid #CBD8E6', borderRadius: '16px', background: 'var(--color-background-primary)' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  theadRow:   { background: 'var(--color-background-secondary)' },
  th:         { padding: '9px 14px', fontWeight: 500, fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #CBD8E6', whiteSpace: 'nowrap' },
  td:         { padding: '10px 14px', color: 'var(--color-text-secondary)', verticalAlign: 'top' },
  emptyCell:  { padding: '24px 14px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontStyle: 'italic', fontSize: '13px', lineHeight: 1.6 },
  cellStrong: { fontWeight: 500, color: 'var(--color-text-primary)' },
  cellSub:    { fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' },
  quiet:      { color: 'var(--color-text-secondary)', fontSize: '12px' },
  mono:       { fontFamily: 'monospace', fontSize: '12px', color: 'var(--color-text-primary)' },
  wrap:       { display: 'block', maxWidth: '360px', fontSize: '12px', lineHeight: 1.5, color: 'var(--color-text-secondary)' },
  code:       { fontFamily: 'monospace', fontSize: '11px', color: 'var(--color-text-primary)', background: 'var(--color-background-secondary)', padding: '2px 6px', borderRadius: '5px' },

  pill:       { display: 'inline-block', fontSize: '10px', fontWeight: 600, padding: '2px 9px', borderRadius: '20px', letterSpacing: '0.04em', whiteSpace: 'nowrap' },
  pillLarge:  { display: 'inline-block', fontSize: '12px', fontWeight: 600, padding: '5px 14px', borderRadius: '20px', letterSpacing: '0.05em', whiteSpace: 'nowrap' },

  detailHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' },
  detailTitle:{ fontSize: '22px', fontWeight: 500, color: '#0D1B2A', marginBottom: '4px', fontFamily: 'monospace', letterSpacing: '-0.4px' },
  metaGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px 26px' },
  metaLabel:  { display: 'block', fontSize: '10px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' },
  metaValue:  { fontSize: '13px', color: 'var(--color-text-primary)', lineHeight: 1.5, wordBreak: 'break-word' },

  qtyStrip:   { display: 'flex', gap: '34px', flexWrap: 'wrap' },
  qtyValue:   { fontSize: '20px', fontWeight: 300, color: 'var(--color-text-primary)', fontFamily: 'monospace', lineHeight: 1.2 },

  timeline:   { display: 'flex', flexDirection: 'column' },
  timelineRow:{ display: 'flex', gap: '14px' },
  timelineRail:{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '10px', flexShrink: 0 },
  timelineDot: { width: '9px', height: '9px', borderRadius: '50%', marginTop: '4px', flexShrink: 0 },
  timelineLine:{ width: '1px', flex: 1, background: '#CBD8E6', margin: '3px 0' },
  timelineBody:{ paddingBottom: '18px', flex: 1, minWidth: 0 },
  timelineHead:{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' },
  timelineType:{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em' },
  timelineWhen:{ fontSize: '11px', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' },
  timelineMeta:{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '3px', display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' },
  dotSep:     { color: 'var(--color-text-tertiary)' },
  sealChip:   { fontFamily: 'monospace', fontSize: '11px', background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', padding: '1px 7px', borderRadius: '5px' },
  timelineNote:{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '5px', lineHeight: 1.55 },

  demoNotice: { display: 'flex', alignItems: 'flex-start', gap: '9px', padding: '9px 13px', border: '1px dashed #CBD8E6', borderRadius: '10px', background: 'var(--color-background-secondary)', fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.55, marginBottom: '14px' },
  demoDot:    { width: '7px', height: '7px', borderRadius: '50%', background: '#BA7517', flexShrink: 0, marginTop: '6px' },
  demoStrong: { color: 'var(--color-text-primary)', fontWeight: 600 },

  emptyBox:   { padding: '18px', borderRadius: '10px', background: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)', fontSize: '13px', fontStyle: 'italic', lineHeight: 1.6 },
  errorBox:   { background: '#FAECE7', color: '#993C1D', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', lineHeight: 1.5, fontFamily: 'monospace', wordBreak: 'break-word' },
  loading:    { padding: '40px', color: 'var(--color-text-secondary)', fontSize: '13px' },

  linkBtn:    { background: 'none', border: 'none', padding: 0, color: '#2176AE', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  btnPrimary: { padding: '9px 20px', border: 'none', borderRadius: '8px', background: '#0D1B2A', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: 'fit-content' },
}
