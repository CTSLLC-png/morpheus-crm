import test from 'node:test'
import assert from 'node:assert/strict'
import { sortReleasesForDisplay } from './artistCatalog.js'

test('a released single sorts above an album still in production', () => {
  const out = sortReleasesForDisplay([
    { title: 'The Hands That Hold America', status: 'in-production', release_date: null },
    { title: 'We Are American', status: 'released', release_date: '2026-10-20' },
  ])
  assert.deepEqual(out.map(r => r.title), ['We Are American', 'The Hands That Hold America'])
})

test('released items are newest first and the input is not mutated', () => {
  const input = [
    { title: 'Older', status: 'released', release_date: '2026-01-01' },
    { title: 'Newer', status: 'released', release_date: '2026-10-01' },
    { title: 'Scheduled', status: 'scheduled', release_date: '2026-12-01' },
  ]
  const out = sortReleasesForDisplay(input)
  assert.deepEqual(out.map(r => r.title), ['Newer', 'Older', 'Scheduled'])
  assert.equal(input[0].title, 'Older')
})
