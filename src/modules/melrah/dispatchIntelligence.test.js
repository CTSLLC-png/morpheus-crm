import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeDispatchQueue } from './dispatchIntelligence.js'
const now = new Date('2026-10-09T12:00:00Z')
describe('Melrah dispatch advisory engine', () => {
  it('flags overdue, unassigned coffee pickup without changing input', () => {
    const row = {id:'coffee-1',program_key:'ORGANICS_COFFEE',status:'OPEN',scheduled_for:'2026-10-08T12:00:00Z',max_fill_pct:95}
    const snapshot = JSON.stringify(row)
    const result = analyzeDispatchQueue([row],now)[0]
    for (const flag of ['UNASSIGNED','SCHEDULE_OVERDUE','HIGH_FILL']) assert.ok(result.flags.includes(flag))
    assert.equal(result.severity, 'high')
    assert.equal(JSON.stringify(row), snapshot)
  })
  it('preserves cannabis program and ignores completed work', () => {
    const rows=[{id:'a',program_key:'CANNABIS_PACKAGING',status:'OPEN',priority:'URGENT'},
      {id:'b',program_key:'ORGANICS_COFFEE',status:'COMPLETED'}]
    const result=analyzeDispatchQueue(rows,now)
    assert.equal(result.length, 1)
    assert.equal(result[0].programKey, 'CANNABIS_PACKAGING')
  })
  it('rejects unknown programs and handles malformed schedules safely', () => {
    const result=analyzeDispatchQueue([{id:'x',program_key:'UNKNOWN'},{id:'y',program_key:'ORGANICS_COFFEE',scheduled_for:'invalid'}],now)
    expect(result).toHaveLength(1)
    assert.ok(result[0].flags.includes('MISSING_SCHEDULE'))
  })
  it('does not assume missing fill means empty or high fill', () => {
    const result=analyzeDispatchQueue([{id:'x',program_key:'ORGANICS_COFFEE',max_fill_pct:null}],now)
    assert.ok(!result[0].flags.includes('HIGH_FILL'))
  })
})
