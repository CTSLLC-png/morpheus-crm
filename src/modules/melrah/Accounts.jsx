// src/modules/melrah/Accounts.jsx
// ── Melrah — Provider Networks ─────────────────────────────────
// Health-system accounts, their facilities, and the onboarding pipeline.
// An account becomes active by completing its blocking onboarding steps —
// enforced in the database by melrah.enforce_activation_gate — so this screen
// shows progress against those steps rather than offering a status dropdown.

import { useEffect, useState } from 'react'
import { fromModuleSchema } from '../../lib/morpheus.js'
import { DataState, ModuleHeader, Pill, Table, styles } from '../common/ModuleFrame.jsx'

const SCHEMA = 'melrah'

export default function MelrahAccounts() {
  const [accounts, setAccounts] = useState({ loading: true })
  const [steps, setSteps] = useState({ loading: true })

  useEffect(() => {
    fromModuleSchema(SCHEMA, 'account', q => q.order('created_at', { ascending: false }))
      .then(r => setAccounts({ loading: false, ...r }))
    fromModuleSchema(SCHEMA, 'onboarding_step', q => q.order('sort_order', { ascending: true }))
      .then(r => setSteps({ loading: false, ...r }))
  }, [])

  return (
    <div>
      <ModuleHeader
        title="Provider Networks"
        subtitle="Health system accounts, facilities and the onboarding pipeline"
        right={accounts.data && <Pill tone="info">{accounts.data.length} accounts</Pill>}
      />

      <DataState
        {...accounts}
        schema={SCHEMA}
        rows={accounts.data}
        empty="No provider accounts yet. Adding the first health-system account seeds its onboarding tasks automatically."
      >
        <Table
          columns={['Account', 'Network type', 'Stage', 'Region', 'Est. annual volume']}
          rows={accounts.data ?? []}
          keyOf={a => a.id}
          renderRow={a => (
            <>
              <td style={{ ...styles.td, fontWeight:500 }}>{a.name}</td>
              <td style={{ ...styles.td, color:'#5B6B7F' }}>{a.network_type ?? '—'}</td>
              <td style={styles.td}><Pill tone="info">{a.stage ?? 'NEW'}</Pill></td>
              <td style={styles.td}>{a.region ?? '—'}</td>
              <td style={{ ...styles.td, fontFamily:'monospace' }}>
                {a.est_annual_volume?.toLocaleString() ?? '—'}
              </td>
            </>
          )}
        />
      </DataState>

      <div style={{ height:'26px' }} />
      <ModuleHeader
        title="Onboarding pipeline"
        subtitle="Blocking steps must complete before an account can be activated"
      />
      <DataState {...steps} schema={SCHEMA} rows={steps.data} empty="No onboarding steps configured.">
        <Table
          columns={['#', 'Step', 'Owner role', 'Blocking']}
          rows={steps.data ?? []}
          keyOf={s => s.key}
          renderRow={s => (
            <>
              <td style={{ ...styles.td, fontFamily:'monospace', color:'#5B6B7F' }}>{s.sort_order}</td>
              <td style={{ ...styles.td, fontWeight:500 }}>{s.name}</td>
              <td style={{ ...styles.td, color:'#5B6B7F' }}>{s.owner_role ?? '—'}</td>
              <td style={styles.td}>
                {s.blocking ? <Pill tone="bad">Blocking</Pill> : <Pill tone="neutral">Optional</Pill>}
              </td>
            </>
          )}
        />
      </DataState>
    </div>
  )
}
