import { describe, expect, it } from 'vitest'
import { analyzeDispatchQueue } from './dispatchIntelligence.js'
const now = new Date('2026-10-09T12:00:00Z')
describe('Melrah dispatch advisory engine', () => {
  it('flags overdue, unassigned coffee pickup without changing input', () => {
    const row = {id:'coffee-1',program_key:'ORGANICS_COFFEE',status:'OPEN',scheduled_for:'2026-10-08T12:00:00Z',max_fill_pct:95}
    const snapshot = JSON.stringify(row)
    const result = analyzeDispatchQueue([row],now)[0]
    expect(result.flags).toEqual(expect.arrayContaining(['UNASSIGNED','SCHEDULE_OVERDUE','HIGH_FILL']))
    expect(result.severity).toBe('high')
    expect(JSON.stringify(row)).toBe(snapshot)
  })
  it('preserves cannabis program and ignores completed work', () => {
    const rows=[{id:'a',program_key:'CANNABIS_PACKAGING',status:'OPEN',priority:'URGENT'},
      {id:'b',program_key:'ORGANICS_COFFEE',status:'COMPLETED'}]
    const result=analyzeDispatchQueue(rows,now)
    expect(result).toHaveLength(1)
    expect(result[0].programKey).toBe('CANNABIS_PACKAGING')
  })
  it('rejects unknown programs and handles malformed schedules safely', () => {
    const result=analyzeDispatchQueue([{id:'x',program_key:'UNKNOWN'},{id:'y',program_key:'ORGANICS_COFFEE',scheduled_for:'invalid'}],now)
    expect(result).toHaveLength(1)
    expect(result[0].flags).toContain('MISSING_SCHEDULE')
  })
  it('does not assume missing fill means empty or high fill', () => {
    const result=analyzeDispatchQueue([{id:'x',program_key:'ORGANICS_COFFEE',max_fill_pct:null}],now)
    expect(result[0].flags).not.toContain('HIGH_FILL')
  })
})
