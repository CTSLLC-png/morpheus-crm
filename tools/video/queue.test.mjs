// node --test queue.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claim, finish, SCRIPT_NAME } from './queue.mjs'

const JOB = '0b9d7b8e-3f1a-4c2b-9a1e-2f3c4d5e6f70'
const PROJECT = '11111111-2222-3333-4444-555555555555'
const key = 'k'.repeat(40)

function scriptsDir(names = ['demo']) {
  const dir = join(mkdtempSync(join(tmpdir(), 'queue-')), 'scripts')
  mkdirSync(dir)
  for (const n of names) writeFileSync(join(dir, `${n}.json`), '{}')
  return dir
}

function fakeAgent(job) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body)
    calls.push({ ...body, key: init.headers['x-studio-key'] })
    if (body.action === 'claim_job') return { ok: true, status: 200, json: async () => ({ ok: true, job }) }
    return { ok: true, status: 200, json: async () => ({ ok: true, job_id: body.job_id }) }
  }
  return { calls, fetchImpl }
}

test('script names allow only plain lower-case file names', () => {
  for (const ok of ['demo', 'legacy-path-explainer', 'a1']) assert.ok(SCRIPT_NAME.test(ok), ok)
  for (const bad of ['', '../x', 'Demo', 'demo.json', '-x', 'a b', 'a;rm -rf', 'x'.repeat(81)]) assert.ok(!SCRIPT_NAME.test(bad), bad)
})

test('empty queue returns null', async () => {
  const { fetchImpl } = fakeAgent(null)
  assert.equal(await claim({ key, url: 'https://agent.test', fetchImpl, scriptsDir: scriptsDir() }), null)
})

test('claims a job and resolves its script file', async () => {
  const dir = scriptsDir()
  const { calls, fetchImpl } = fakeAgent({ id: JOB, script: 'demo', project_id: PROJECT })
  const job = await claim({ key, url: 'https://agent.test', fetchImpl, scriptsDir: dir, runUrl: 'https://github.com/o/r/actions/runs/1' })
  assert.equal(job.file, `${dir}/demo.json`)
  assert.equal(job.project_id, PROJECT)
  assert.equal(calls[0].action, 'claim_job')
  assert.equal(calls[0].run_url, 'https://github.com/o/r/actions/runs/1')
  assert.equal(calls[0].key, key)
})

test('a missing script fails the job instead of rendering', async () => {
  const { calls, fetchImpl } = fakeAgent({ id: JOB, script: 'nope', project_id: null })
  const job = await claim({ key, url: 'https://agent.test', fetchImpl, scriptsDir: scriptsDir() })
  assert.equal(job.missing, true)
  assert.equal(calls[1].action, 'finish_job')
  assert.equal(calls[1].ok, false)
  assert.match(calls[1].error, /No script named nope/)
})

test('a tampered job is failed and refused', async () => {
  const { calls, fetchImpl } = fakeAgent({ id: JOB, script: '$(whoami)', project_id: null })
  await assert.rejects(claim({ key, url: 'https://agent.test', fetchImpl, scriptsDir: scriptsDir() }), /validation/)
  assert.equal(calls[1].action, 'finish_job')
  assert.equal(calls[1].ok, false)
})

test('finish reports done with a count, or failed with a reason', async () => {
  const { calls, fetchImpl } = fakeAgent(null)
  await finish({ key, url: 'https://agent.test', fetchImpl, jobId: JOB, ok: true, assetCount: '5' })
  await finish({ key, url: 'https://agent.test', fetchImpl, jobId: JOB, ok: false, error: 'boom' })
  assert.deepEqual([calls[0].ok, calls[0].asset_count], [true, 5])
  assert.deepEqual([calls[1].ok, calls[1].error, calls[1].asset_count], [false, 'boom', null])
})

test('finish rejects bad ids and counts, and needs a key', async () => {
  const { fetchImpl } = fakeAgent(null)
  await assert.rejects(finish({ key, fetchImpl, jobId: 'x', ok: true }), /uuid/)
  await assert.rejects(finish({ key, fetchImpl, jobId: JOB, ok: true, assetCount: 500 }), /0 to 100/)
  await assert.rejects(finish({ fetchImpl, jobId: JOB, ok: true }), /STUDIO_AGENT_KEY/)
})
