// src/lib/morpheus.js
// ── Morpheus OS — kernel access ────────────────────────────────
//
// The OS kernel lives in the `core` schema: core.tenant, core.module,
// core.tenant_module and core.membership. A tab exists because a row exists
// in core.tenant_module — never because it was hardcoded into the shell.
//
// The Supabase Data API currently exposes only `public`, so `core` is not
// directly readable from the browser. public.morpheus_bootstrap() is a
// SECURITY INVOKER bridge that returns the same information; core RLS still
// applies, so a user only ever receives their own tenants and modules.
//
// When `core` is added to Exposed Schemas (Dashboard → Project Settings →
// API), readKernelDirect() takes over automatically and the bridge can retire.

import { supabase } from './supabase.js'

/** Shape returned to the shell, whichever path produced it. */
function normalise(tenants) {
  return (tenants ?? []).map(t => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    legalEntity: t.legal_entity ?? null,
    industry: t.industry ?? null,
    status: t.status,
    role: t.role ?? null,
    modules: (t.modules ?? [])
      .map(m => ({
        key: m.key,
        name: m.name,
        description: m.description ?? '',
        schema: m.schema ?? m.schema_name ?? null,
        category: m.category ?? null,
        status: m.status,
        sortOrder: m.sort_order ?? 999,
        enabled: m.enabled === true,
        config: m.config ?? {},
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }))
}

/** Preferred path once `core` is exposed to the Data API. */
async function readKernelDirect() {
  const { data, error } = await supabase
    .schema('core')
    .from('tenant_module')
    .select(`
      enabled, config,
      tenant:tenant_id ( id, slug, name, legal_entity, industry, status ),
      module:module_key ( key, name, description, schema_name, category, status, sort_order )
    `)
  if (error) throw error

  const byTenant = new Map()
  for (const row of data ?? []) {
    if (!row.tenant || !row.module) continue
    const t = row.tenant
    if (!byTenant.has(t.id)) byTenant.set(t.id, { ...t, modules: [] })
    byTenant.get(t.id).modules.push({ ...row.module, enabled: row.enabled, config: row.config })
  }
  return normalise([...byTenant.values()])
}

/** Bridge path — works today with no project-settings change. */
async function readKernelViaBridge() {
  const { data, error } = await supabase.rpc('morpheus_bootstrap')
  if (error) throw error
  return normalise(data?.tenants)
}

/**
 * Load the signed-in user's tenants and their enabled modules.
 * Never throws: on total failure it returns an empty list plus the reason, and
 * the shell falls back to the CER module so the product keeps working.
 */
export async function loadWorkspace() {
  try {
    return { tenants: await readKernelDirect(), source: 'core', error: null }
  } catch (directErr) {
    try {
      return { tenants: await readKernelViaBridge(), source: 'bridge', error: null }
    } catch (bridgeErr) {
      return {
        tenants: [],
        source: 'fallback',
        error: bridgeErr?.message ?? directErr?.message ?? 'kernel unreachable',
      }
    }
  }
}

/**
 * Read from a module schema. Returns { data, error, unexposed } where
 * `unexposed` is true when the schema exists in Postgres but the Data API has
 * not been told to expose it — a configuration gap, not a missing feature, and
 * worth saying so on screen rather than showing an empty table.
 */
export async function fromModuleSchema(schema, table, build = q => q) {
  try {
    const { data, error } = await build(supabase.schema(schema).from(table).select('*'))
    if (error) {
      const unexposed = error.code === 'PGRST106' || /schema must be one of|Invalid schema/i.test(error.message ?? '')
      return { data: null, error, unexposed }
    }
    return { data: data ?? [], error: null, unexposed: false }
  } catch (e) {
    return { data: null, error: e, unexposed: false }
  }
}

export const SCHEMA_HELP =
  'This module’s tables exist in the database but the Supabase Data API is not ' +
  'exposing its schema yet. An administrator can enable it in Dashboard → ' +
  'Project Settings → API → Exposed schemas. Row Level Security already ' +
  'protects these tables, so exposing the schema does not widen access.'
