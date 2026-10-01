// src/modules/empowercare/index.jsx
// ── EmpowerCare — Health Insurance Contact Center Specialist ────
// 40-hour gated specialisation. The rules live in the database
// (empowercare.assessment drives gating; attempts are immutable once
// submitted; retention is derived from the funding instrument). This screen
// surfaces the assessment matrix and roster; it never edits a gate threshold,
// because changing one applies to future cohorts only and is an admin action.

import { useEffect, useState } from 'react'
import { fromModuleSchema } from '../../lib/morpheus.js'
import { DataState, ModuleHeader, Pill, Table, styles } from '../common/ModuleFrame.jsx'

const SCHEMA = 'empowercare'

function gateTone(isGate) { return isGate ? 'warn' : 'neutral' }

export default function EmpowerCareModule() {
  const [assessments, setAssessments] = useState({ loading: true })
  const [enrollments, setEnrollments] = useState({ loading: true })

  useEffect(() => {
    fromModuleSchema(SCHEMA, 'assessment', q => q.order('sort_order', { ascending: true }))
      .then(r => setAssessments({ loading: false, ...r }))
    fromModuleSchema(SCHEMA, 'enrollment', q => q.order('enrolled_at', { ascending: false }).limit(50))
      .then(r => setEnrollments({ loading: false, ...r }))
  }, [])

  const gateCount = (assessments.data ?? []).filter(a => a.is_gate).length
  const totalItems = (assessments.data ?? []).reduce((n, a) => n + (a.item_count ?? 0), 0)

  return (
    <div>
      <ModuleHeader
        title="EmpowerCare"
        subtitle="Health Insurance Contact Center Specialist — 40-hour gated specialisation"
        right={
          assessments.data && (
            <div style={{ display:'flex', gap:'8px' }}>
              <Pill tone="info">{assessments.data.length} assessments</Pill>
              <Pill tone="warn">{gateCount} gates</Pill>
              <Pill tone="neutral">{totalItems} items</Pill>
            </div>
          )
        }
      />

      <div style={{ marginBottom:'12px', fontSize:'13px', color:'#5B6B7F' }}>
        Assessment matrix — thresholds and gates are configuration. Editing one
        applies to <em>future</em> cohorts only; a learner who is stuck goes to
        remediation, never to a lowered threshold.
      </div>

      <DataState
        {...assessments}
        schema={SCHEMA}
        rows={assessments.data}
        empty="No assessments configured."
      >
        <Table
          columns={['Day', 'Assessment', 'Instrument', 'Items', 'Threshold', 'Gate', 'Remediation limit']}
          rows={assessments.data ?? []}
          keyOf={a => a.key}
          renderRow={a => (
            <>
              <td style={{ ...styles.td, fontFamily:'monospace', color:'#5B6B7F' }}>{a.day ?? '—'}</td>
              <td style={{ ...styles.td, fontWeight:500 }}>{a.name}</td>
              <td style={{ ...styles.td, color:'#5B6B7F' }}>{a.instrument ?? '—'}</td>
              <td style={styles.td}>{a.item_count ?? '—'}</td>
              <td style={{ ...styles.td, fontFamily:'monospace' }}>{a.threshold ?? '—'}</td>
              <td style={styles.td}>
                {a.is_gate
                  ? <Pill tone={gateTone(true)}>{a.gate_type ?? 'GATE'}</Pill>
                  : <span style={{ color:'#9AA8B8', fontSize:'12px' }}>—</span>}
              </td>
              <td style={styles.td}>{a.remediation_limit ?? '—'}</td>
            </>
          )}
        />
      </DataState>

      <div style={{ height:'26px' }} />
      <ModuleHeader title="Enrollments" subtitle="Learners currently moving through the program" />
      <DataState
        {...enrollments}
        schema={SCHEMA}
        rows={enrollments.data}
        empty="No learner has been enrolled in EmpowerCare yet. The program rules are configured and ready — the first cohort is the next step."
      >
        <Table
          columns={['Enrollment', 'State', 'Curriculum', 'Enrolled', 'Completed', 'Retain until']}
          rows={enrollments.data ?? []}
          keyOf={e => e.id}
          renderRow={e => (
            <>
              <td style={{ ...styles.td, fontFamily:'monospace', fontSize:'11px', color:'#5B6B7F' }}>
                {String(e.id).slice(0, 8)}
              </td>
              <td style={styles.td}><Pill tone="info">{e.state}</Pill></td>
              <td style={styles.td}>{e.curriculum_version ?? '—'}</td>
              <td style={styles.td}>{e.enrolled_at?.slice(0, 10) ?? '—'}</td>
              <td style={styles.td}>{e.completed_at?.slice(0, 10) ?? '—'}</td>
              <td style={{ ...styles.td, fontFamily:'monospace', color:'#5B6B7F' }}>
                {e.retain_until ?? '—'}
              </td>
            </>
          )}
        />
      </DataState>
    </div>
  )
}
