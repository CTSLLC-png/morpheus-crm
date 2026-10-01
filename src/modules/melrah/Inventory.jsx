// src/modules/melrah/Inventory.jsx
// ── Melrah — Inventory & QC ────────────────────────────────────
// Lot tracking, quality inspection and disposition control.
// A lot enters QUARANTINE and cannot reach RELEASED without a passing QC
// inspection — enforced by melrah.enforce_release_gate. There is deliberately
// no "set status to released" control here; release happens through QC.

import { useEffect, useState } from 'react'
import { fromModuleSchema } from '../../lib/morpheus.js'
import { DataState, ModuleHeader, Pill, Table, styles } from '../common/ModuleFrame.jsx'

const SCHEMA = 'melrah'

function lotTone(s) {
  const v = String(s ?? '').toUpperCase()
  if (v === 'RELEASED') return 'good'
  if (v === 'QUARANTINE') return 'warn'
  if (v === 'REJECTED' || v === 'SCRAPPED') return 'bad'
  return 'info'
}

export default function MelrahInventory() {
  const [lots, setLots] = useState({ loading: true })
  const [ncrs, setNcrs] = useState({ loading: true })

  useEffect(() => {
    fromModuleSchema(SCHEMA, 'lot_status', q => q.limit(100))
      .then(r => setLots({ loading: false, ...r }))
    fromModuleSchema(SCHEMA, 'nonconformance', q => q.order('raised_at', { ascending: false }).limit(50))
      .then(r => setNcrs({ loading: false, ...r }))
  }, [])

  const quarantined = (lots.data ?? []).filter(l => String(l.status).toUpperCase() === 'QUARANTINE').length
  const blocked = (lots.data ?? []).filter(l => (l.open_critical_ncrs ?? 0) > 0).length

  return (
    <div>
      <ModuleHeader
        title="Inventory & QC"
        subtitle="Lot tracking, quality inspection and disposition control"
        right={lots.data && (
          <div style={{ display:'flex', gap:'8px' }}>
            <Pill tone="warn">{quarantined} in quarantine</Pill>
            {blocked > 0 && <Pill tone="bad">{blocked} blocked by NCR</Pill>}
          </div>
        )}
      />

      <div style={{ marginBottom:'12px', fontSize:'13px', color:'#5B6B7F' }}>
        A lot cannot leave quarantine without a passing inspection. Release is a
        QC outcome, not a status change.
      </div>

      <DataState
        {...lots}
        schema={SCHEMA}
        rows={lots.data}
        empty="No lots received yet. Lots appear here once a work order is received against them."
      >
        <Table
          columns={['Lot', 'Device', 'Account', 'Status', 'Received', 'Released', 'Cycle', 'Open critical NCRs']}
          rows={lots.data ?? []}
          keyOf={l => l.id}
          renderRow={l => (
            <>
              <td style={{ ...styles.td, fontFamily:'monospace', fontWeight:500 }}>{l.lot_number}</td>
              <td style={styles.td}>{l.device ?? l.sku ?? '—'}</td>
              <td style={{ ...styles.td, color:'#5B6B7F' }}>{l.account ?? '—'}</td>
              <td style={styles.td}><Pill tone={lotTone(l.status)}>{l.status}</Pill></td>
              <td style={{ ...styles.td, fontFamily:'monospace' }}>{l.qty_received ?? '—'}</td>
              <td style={{ ...styles.td, fontFamily:'monospace' }}>{l.qty_released ?? '—'}</td>
              <td style={{ ...styles.td, fontFamily:'monospace' }}>{l.cycle_number ?? '—'}</td>
              <td style={styles.td}>
                {(l.open_critical_ncrs ?? 0) > 0
                  ? <Pill tone="bad">{l.open_critical_ncrs}</Pill>
                  : <span style={{ color:'#9AA8B8', fontSize:'12px' }}>none</span>}
              </td>
            </>
          )}
        />
      </DataState>

      <div style={{ height:'26px' }} />
      <ModuleHeader title="Nonconformance / CAPA" subtitle="Open findings against lots and work orders" />
      <DataState {...ncrs} schema={SCHEMA} rows={ncrs.data} empty="No nonconformance reports raised.">
        <Table
          columns={['NCR', 'Severity', 'Status', 'Raised', 'By', 'CAPA ref']}
          rows={ncrs.data ?? []}
          keyOf={n => n.id}
          renderRow={n => (
            <>
              <td style={{ ...styles.td, fontFamily:'monospace', fontWeight:500 }}>{n.ncr_number}</td>
              <td style={styles.td}>
                <Pill tone={String(n.severity).toUpperCase() === 'CRITICAL' ? 'bad' : 'warn'}>{n.severity}</Pill>
              </td>
              <td style={styles.td}><Pill tone={n.closed_at ? 'good' : 'info'}>{n.status}</Pill></td>
              <td style={styles.td}>{n.raised_at?.slice(0, 10) ?? '—'}</td>
              <td style={{ ...styles.td, color:'#5B6B7F' }}>{n.raised_by ?? '—'}</td>
              <td style={{ ...styles.td, fontFamily:'monospace', fontSize:'11px' }}>{n.capa_ref ?? '—'}</td>
            </>
          )}
        />
      </DataState>
    </div>
  )
}
