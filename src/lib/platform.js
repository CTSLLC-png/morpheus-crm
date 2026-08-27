// src/lib/platform.js
// ── MorpheusOS — Platform registry (core.*) ────────────────────
// The `core` schema is the multi-tenant, multi-product spine:
//   core.tenant         — the organisations on the platform
//   core.module         — the service catalogue (ordered by sort_order)
//   core.tenant_module  — which tenant has which service enabled
//   core.membership     — user → tenant → role
//
// PostgREST only exposes `public`, so all four are read through the
// passthrough views `core_tenant`, `core_module`, `core_tenant_module`
// and `core_membership`. Those are plain views over tables in another
// schema, so joins are resolved here with a second query rather than
// through PostgREST resource embedding — embedding across passthrough
// views depends on relationship inference we cannot rely on.

import { supabase } from './supabase.js'

// ── TENANTS ────────────────────────────────────────────────────

/**
 * Tenants the signed-in user belongs to, via core_membership joined to
 * core_tenant. Each row carries the caller's role in that tenant.
 * Returns [] when nobody is signed in or the user has no memberships.
 */
export async function getCurrentTenants() {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) return []

  const { data: memberships, error: membershipError } = await supabase
    .from('core_membership')
    .select('tenant_id, role')
    .eq('user_id', user.id)

  if (membershipError) throw membershipError
  if (!memberships?.length) return []

  const { data: tenants, error: tenantError } = await supabase
    .from('core_tenant')
    .select('id, slug, name, legal_entity, industry, status')
    .in('id', memberships.map(m => m.tenant_id))

  if (tenantError) throw tenantError

  const roleByTenant = new Map(memberships.map(m => [m.tenant_id, m.role]))
  return (tenants ?? [])
    .map(t => ({ ...t, role: roleByTenant.get(t.id) ?? null }))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
}

/**
 * The caller's core_membership.role for one tenant
 * ('OWNER' | 'ADMIN' | 'INSTRUCTOR' | 'OPERATOR' | 'QC' | 'VIEWER' |
 * 'AUDITOR'), or null if they are not a member of it.
 */
export async function getTenantRole(tenantId) {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) return null

  const { data, error } = await supabase
    .from('core_membership')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) throw error
  return data?.role ?? null
}

// ── MODULES ────────────────────────────────────────────────────

/**
 * Modules enabled for a tenant, ordered by core_module.sort_order.
 * Joins core_tenant_module → core_module and excludes rows where
 * `enabled` is false. `status` is surfaced so callers can render a
 * PLANNED module differently from an AVAILABLE one.
 */
export async function getEnabledModules(tenantId) {
  if (!tenantId) return []

  const { data: links, error: linkError } = await supabase
    .from('core_tenant_module')
    .select('module_key, enabled, config')
    .eq('tenant_id', tenantId)
    .eq('enabled', true)

  if (linkError) throw linkError
  if (!links?.length) return []

  const { data: modules, error: moduleError } = await supabase
    .from('core_module')
    .select('key, name, description, schema_name, category, status, sort_order')
    .in('key', links.map(l => l.module_key))
    .order('sort_order', { ascending: true })

  if (moduleError) throw moduleError

  const configByKey = new Map(links.map(l => [l.module_key, l.config]))
  return (modules ?? []).map(m => ({ ...m, config: configByKey.get(m.key) ?? {} }))
}

/** The full service catalogue, ordered — every module the platform knows. */
export async function getAllModules() {
  const { data, error } = await supabase
    .from('core_module')
    .select('key, name, description, schema_name, category, status, sort_order')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data
}
