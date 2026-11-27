import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setActiveTenant, activeTenantId, withTenant, scoped, tenantFolder } from './activeTenant.js'

test('with no tenant nothing is stamped and queries are untouched', () => {
  setActiveTenant(null)
  assert.equal(activeTenantId(), null)
  assert.deepEqual(withTenant({ a: 1 }), { a: 1 })
  const q = { eq: () => { throw new Error('should not filter') } }
  assert.equal(scoped(q), q)
  assert.equal(tenantFolder(), '')
})

test('the active tenant is stamped on rows, filters lists and prefixes files', () => {
  setActiveTenant('t-1')
  assert.deepEqual(withTenant({ a: 1, tenant_id: 'other' }), { a: 1, tenant_id: 't-1' })
  assert.deepEqual(withTenant([{ a: 1 }, { a: 2 }]), [{ a: 1, tenant_id: 't-1' }, { a: 2, tenant_id: 't-1' }])
  const calls = []
  scoped({ eq: (c, v) => { calls.push([c, v]); return 'filtered' } })
  assert.deepEqual(calls, [['tenant_id', 't-1']])
  assert.equal(tenantFolder(), 't-1/')
  setActiveTenant(null)
})
