// node --test src/modules/studio/renderQueue.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanScriptName, renderJobError, jobTiming, SCRIPT_NAME } from './renderQueue.js'

test('script names are cleaned to the bare file name', () => {
  assert.equal(cleanScriptName('legacy-path-explainer'), 'legacy-path-explainer')
  assert.equal(cleanScriptName(' Legacy-Path-Explainer.json '), 'legacy-path-explainer')
  assert.equal(cleanScriptName('scripts/demo.json'), 'demo')
  assert.equal(cleanScriptName('tools/video/scripts/demo.json'), 'demo')
})

test('unsafe or malformed names are refused', () => {
  for (const bad of ['', '../demo', 'a/b', 'demo;ls', '$(id)', '-demo', 'a b', 'x'.repeat(81), null, undefined]) {
    assert.equal(cleanScriptName(bad), null, String(bad))
  }
})

test('the client rule matches the database rule', () => {
  assert.equal(SCRIPT_NAME.source, '^[a-z0-9][a-z0-9-]{0,79}$')
})

test('database refusals read as sentences', () => {
  assert.match(renderJobError({ code: '23505' }), /already queued/)
  assert.match(renderJobError({ code: '42501' }), /staff/)
  assert.match(renderJobError({ code: '23514', message: 'The render queue is full (20 open jobs).' }), /full/)
  assert.equal(renderJobError({ message: 'other' }), 'other')
})

test('timing reads naturally', () => {
  const t = '2026-11-26T10:00:00Z'
  assert.equal(jobTiming({ status: 'queued', requested_at: t }, Date.parse('2026-11-26T10:05:00Z')), 'waiting 5 min')
  assert.equal(jobTiming({ status: 'running', requested_at: t, claimed_at: '2026-11-26T10:01:00Z' }, Date.parse('2026-11-26T10:04:00Z')), 'rendering 3 min')
  assert.equal(jobTiming({ status: 'done', claimed_at: t, finished_at: '2026-11-26T10:03:00Z' }), 'took 3 min')
})

test('KNOWN_SCRIPTS matches tools/video/scripts', async () => {
  const { readdirSync } = await import('node:fs')
  const { KNOWN_SCRIPTS } = await import('./renderQueue.js')
  const onDisk = readdirSync(new URL('../../../tools/video/scripts/', import.meta.url))
    .filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort()
  assert.deepEqual([...KNOWN_SCRIPTS].sort(), onDisk)
})
