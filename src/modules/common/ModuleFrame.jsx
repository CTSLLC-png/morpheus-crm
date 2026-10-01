// src/modules/common/ModuleFrame.jsx
// ── Shared module chrome: the four states every module screen owes the user ──
// Loading, empty, error and not-yet-reachable are different things and each
// deserves a different sentence. An empty table that actually means
// "misconfigured" is how a config gap gets mistaken for a missing feature.

import { Component } from 'react'
import { SCHEMA_HELP } from '../../lib/morpheus.js'

const c = {
  card:   { background:'#fff', border:'1px solid #CBD8E6', borderRadius:'16px', overflow:'hidden' },
  head:   { padding:'16px 18px', borderBottom:'1px solid #E6EDF5' },
  title:  { fontSize:'15px', fontWeight:500, color:'#0D1B2A' },
  sub:    { fontSize:'12px', color:'#5B6B7F', marginTop:'3px' },
  pad:    { padding:'22px 18px', fontSize:'13px', color:'#5B6B7F' },
  th:     { padding:'9px 14px', textAlign:'left', fontWeight:500, fontSize:'11px', color:'#5B6B7F',
            textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid #CBD8E6',
            background:'#F7F9FC' },
  td:     { padding:'10px 14px', fontSize:'13px', color:'#0D1B2A' },
  notice: { margin:'0', padding:'18px', background:'#FFF8E6', borderRadius:'12px',
            border:'1px solid #F0DFB0', fontSize:'13px', color:'#6B5320', lineHeight:1.55 },
  error:  { margin:'0', padding:'18px', background:'#FDECE7', borderRadius:'12px',
            border:'1px solid #F2C4B5', fontSize:'13px', color:'#7A2E14', lineHeight:1.55 },
  pill:   { fontSize:'10px', fontWeight:600, padding:'2px 9px', borderRadius:'20px' },
}

export const styles = c

export function Pill({ tone = 'neutral', children }) {
  const tones = {
    good:    { background:'#E1F5EE', color:'#0F6E56' },
    info:    { background:'#E6F1FB', color:'#0C447C' },
    warn:    { background:'#FDF0DC', color:'#8A5B12' },
    bad:     { background:'#FDECE7', color:'#993C1D' },
    neutral: { background:'#EEF2F7', color:'#5B6B7F' },
  }
  return <span style={{ ...c.pill, ...tones[tone] }}>{children}</span>
}

export function ModuleHeader({ title, subtitle, right }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'16px' }}>
      <div>
        <div style={{ fontSize:'19px', fontWeight:500, color:'#0D1B2A' }}>{title}</div>
        {subtitle && <div style={{ fontSize:'13px', color:'#5B6B7F', marginTop:'4px' }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  )
}

export function SchemaUnexposedNotice({ schema }) {
  return (
    <div style={c.notice}>
      <strong>The <code>{schema}</code> schema is not exposed to the API yet.</strong>
      <div style={{ marginTop:'6px' }}>{SCHEMA_HELP}</div>
    </div>
  )
}

/**
 * Renders the right thing for the state you are actually in.
 * `rows` renders only when there is data; `empty` only when the query
 * genuinely returned nothing.
 */
export function DataState({ loading, error, unexposed, schema, rows, empty, children }) {
  if (loading)   return <div style={c.pad}>Loading…</div>
  if (unexposed) return <SchemaUnexposedNotice schema={schema} />
  if (error) {
    return (
      <div style={c.error}>
        <strong>Could not load this module.</strong>
        <div style={{ marginTop:'6px', fontFamily:'monospace', fontSize:'12px' }}>
          {error.message ?? String(error)}
        </div>
      </div>
    )
  }
  if (!rows || rows.length === 0) {
    return <div style={c.pad}>{empty ?? 'Nothing here yet.'}</div>
  }
  return children
}

export function Table({ columns, rows, renderRow, keyOf }) {
  return (
    <div style={c.card}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr>{columns.map(h => <th key={h} style={c.th}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={keyOf ? keyOf(r) : i}
                style={{ borderBottom: i < rows.length - 1 ? '1px solid #F0F4F8' : 'none' }}>
              {renderRow(r)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One module failing to load must not take the shell down with it. */
export class ModuleBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div style={c.error}>
        <strong>The “{this.props.name}” module failed to render.</strong>
        <div style={{ marginTop:'6px', fontFamily:'monospace', fontSize:'12px' }}>
          {this.state.err.message}
        </div>
        <div style={{ marginTop:'8px' }}>The rest of Morpheus is unaffected.</div>
      </div>
    )
  }
}
