// node --test publish.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publish, renderOutputs, vaultPath } from './publish.mjs'

const script = {
  title: 'Demo',
  studioProjectId: '11111111-2222-3333-4444-555555555555',
  outputs: [{ name: '16x9' }, { name: '9x16' }],
}

function fixture({ skip } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'publish-'))
  const outDir = join(dir, 'out')
  mkdirSync(outDir)
  const scriptPath = join(dir, 'demo.json')
  writeFileSync(scriptPath, JSON.stringify(script))
  for (const o of renderOutputs(script, 'demo', outDir)) if (o.file !== skip?.(outDir)) writeFileSync(o.file, 'x')
  return { scriptPath, outDir }
}

function fakeAgent() {
  const calls = []
  const fetchImpl = async (url, init) => {
    if (init.method === 'PUT') { calls.push({ put: url, headers: init.headers }); return { ok: true, status: 200 } }
    const body = JSON.parse(init.body)
    calls.push({ ...body, key: init.headers['x-studio-key'] })
    if (body.action === 'sign_upload') return { ok: true, status: 200, json: async () => ({ ok: true, path: body.path, url: `https://upload.test/${body.path}`, content_type: 'video/mp4' }) }
    return { ok: true, status: 200, json: async () => ({ ok: true, registered: body.assets.length, already_listed: 0, project_id: body.project_id }) }
  }
  return { calls, fetchImpl }
}

test('vault paths stay under renders/ and are cleaned', () => {
  assert.equal(vaultPath('my script', '42', 'out/my script-16x9.mp4'), 'renders/my-script/42/my-script-16x9.mp4')
  assert.equal(vaultPath('../x', '1', '../../etc/passwd'), 'renders/..-x/1/passwd')
})

test('uploads every output, then registers them on the project', async () => {
  const { scriptPath, outDir } = fixture()
  const { calls, fetchImpl } = fakeAgent()
  const res = await publish({ scriptPath, key: 'k'.repeat(40), runId: '77', outDir, url: 'https://agent.test', fetchImpl, log: () => {} })

  assert.equal(calls.filter(c => c.action === 'sign_upload').length, 5) // 2 videos, 2 thumbnails, 1 caption file
  assert.equal(calls.filter(c => c.put).length, 5)
  const reg = calls.at(-1)
  assert.equal(reg.action, 'register')
  assert.equal(reg.project_id, script.studioProjectId)
  assert.deepEqual(reg.assets.map(a => a.path), [
    'renders/demo/77/demo-16x9.mp4', 'renders/demo/77/demo-16x9-thumb.jpg',
    'renders/demo/77/demo-9x16.mp4', 'renders/demo/77/demo-9x16-thumb.jpg',
    'renders/demo/77/demo.srt',
  ])
  assert.ok(calls.filter(c => c.action).every(c => c.key === 'k'.repeat(40)))
  assert.equal(res.registered, 5)
})

test('refuses to run without a key, and uploads nothing if a file is missing', async () => {
  const a = fixture()
  await assert.rejects(publish({ scriptPath: a.scriptPath, outDir: a.outDir, runId: '1', fetchImpl: fakeAgent().fetchImpl }), /STUDIO_AGENT_KEY/)

  const b = fixture({ skip: out => join(out, 'demo.srt') })
  const agent = fakeAgent()
  await assert.rejects(publish({ scriptPath: b.scriptPath, key: 'k'.repeat(40), runId: '1', outDir: b.outDir, fetchImpl: agent.fetchImpl, log: () => {} }), /Missing/)
  assert.equal(agent.calls.length, 0)
})

test('stops with the agent error when a call is refused', async () => {
  const { scriptPath, outDir } = fixture()
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) })
  await assert.rejects(publish({ scriptPath, key: 'bad', runId: '1', outDir, fetchImpl, log: () => {} }), /401.*unauthorized/)
})
