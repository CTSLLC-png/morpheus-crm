// src/modules/melrah/WorkOrders.jsx
// ── Melrah — Work Orders ───────────────────────────────────────
// Batched collection and return work orders with chain of custody.
// melrah.custody_event is append-only by trigger: the custody trail is the
// compliance artefact, so it renders as a ledger, never as editable rows.

import { useEffect, useState } from 'react'
import { fromModuleSchema } from '../../lib/morpheus.js'
import { DataState, ModuleHeader, Pill, Table, styles } from '../common/ModuleFrame.jsx'

const SCHEMA = 'melrah'

function statusTone(s) {
  const v = String(s ?? '').toUpperCase()
  if (v === 'CLOSED' || v === 'COMPLETED') return 'good'
  if (v === 'CANCELLED') return 'bad'
  if (v === 'IN_PROGRESS' || v === 'DISPATCHED') return 'warn'
  return 'info'
}

export default function MelrahWorkOrders() {
  const [orders, setOrders] = useState({ loading: true })
  const [custody, setCustody] = useState({ loading: true })

  useEffect(() => {
    fromModuleSchema(SCHEMA, 'work_order', q => q.order('created_at', { ascending: false }).limit(100))
      .then(r => setOrders({ loading: false, ...r }))
    fromModuleSchema(SCHEMA, 'custody_event', q => q.order('occurred_at', { ascending: false }).limit(25))
      .then(r => setCustody({ loading: false, ...r }))
  }, [])

  const open = (orders.data ?? []).filter(o => !o.closed_at).length

  return (
    <div>
      <ModuleHeader
        title="Work Orders"
        subtitle="Collection and return work orders with chain of custody"
        right={orders.data && (
          <div style={{ display:'flex', gap:'8px' }}>
            <Pill tone="warn">{open} open</Pill>
            <Pill tone="neutral">{orders.data.length} total</Pill>
          </div>
        )}
      />

      <DataState
        {...orders}
        schema={SCHEMA}
        rows={orders.data}
        empty="No work orders yet. Creating one against an active account starts its custody chain."
      >
        <Table
          columns={['WO #', 'Type', 'Status', 'Scheduled', 'Route', 'Closed']}
          rows={orders.data ?? []}
          keyOf={o => o.id}
          renderRow={o => (
            <>
              <td style={{ ...styles.td, fontFamily:'monospace', fontWeight:500 }}>{o.wo_number}</td>
              <td style={{ ...styles.td, color:'#5B6B7F' }}>{o.wo_type ?? '—'}</td>
              <td style={styles.td}><Pill tone={statusTone(o.status)}>{o.status}</Pill></td>
              <td style={styles.td}>{o.scheduled_for ?? '—'}</td>
              <td style={{ ...styles.td, color:'#5B6B7F' }}>{o.route ?? '—'}</td>
              <td style={styles.td}>{o.closed_at?.slice(0, 10) ?? '—'}</td>
            </>
          )}
        />
      </DataState>

      <div style={{ height:'26px' }} />
      <ModuleHeader
        title="Custody ledger"
        subtitle="Append-only. Corrections are new events with a reason; nothing is ever edited away."
      />
      <DataState {...custody} schema={SCHEMA} rows={custody.data} empty="No custody events recorded yet.">
        <Table
          columns={['When', 'Event', 'Actor', 'Location', 'Seal']}
          rows={custody.data ?? []}
          keyOf={e => e.id}
          renderRow={e => (
            <>
              <td style={{ ...styles.td, fontFamily:'monospace', fontSize:'11px', color:'#5B6B7F' }}>
                {e.occurred_at?.replace('T', ' ').slice(0, 16) ?? '—'}
              </td>
              <td style={styles.td}><Pill tone="info">{e.event_type}</Pill></td>
              <td style={styles.td}>{e.actor ?? '—'}</td>
              <td style={{ ...styles.td, color:'#5B6B7F' }}>{e.location ?? '—'}</td>
              <td style={{ ...styles.td, fontFamily:'monospace', fontSize:'11px' }}>{e.seal_number ?? '—'}</td>
            </>
          )}
        />
      </DataState>
    </div>
  )
}
