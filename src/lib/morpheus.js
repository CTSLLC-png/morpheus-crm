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
 * Modules the signed-in PARTICIPANT should see, from
 * public.morpheus_participant_bootstrap(). The RPC is SECURITY INVOKER, so a
 * participant can only ever resolve their own assignments.
 *
 * Returns null on failure rather than an empty array — the caller must be able
 * to distinguish "assigned nothing" from "could not ask", and fall back to
 * showing everything in the second case.
 */
export async function loadParticipantModules() {
  try {
    const { data, error } = await supabase.rpc('morpheus_participant_bootstrap')
    if (error) throw error
    return data?.modules ?? []
  } catch {
    return null
  }
}

/** Staff: the AVAILABLE module catalogue, for assigning programs. */
export async function listAvailableModules() {
  const r = await fromModuleSchema('core', 'module', q => q.order('sort_order'))
  return (r.data ?? []).filter(m => m.status === 'AVAILABLE')
}

/** Staff: module keys currently assigned to one participant. */
export async function getParticipantModules(participantId) {
  const { data, error } = await supabase
    .from('participant_modules')
    .select('module_key, enabled')
    .eq('participant_id', participantId)
    .eq('enabled', true)
  if (error) throw error
  return (data ?? []).map(r => r.module_key)
}

/** Staff: grant or remove one module for one participant. */
export async function setParticipantModule(participantId, moduleKey, enabled) {
  if (enabled) {
    const { error } = await supabase
      .from('participant_modules')
      .upsert({ participant_id: participantId, module_key: moduleKey, enabled: true },
              { onConflict: 'participant_id,module_key' })
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('participant_modules')
      .delete()
      .eq('participant_id', participantId)
      .eq('module_key', moduleKey)
    if (error) throw error
  }
}

/** Health probe for the /admin surface: which path is live, and is it healthy. */
export async function kernelDiagnostics() {
  const probes = []
  for (const [schema, table] of [['core','tenant'], ['empowercare','assessment'], ['melrah','onboarding_step']]) {
    const r = await fromModuleSchema(schema, table, q => q.limit(1))
    probes.push({ schema, reachable: !r.error, via: r.via, rows: r.data?.length ?? 0, error: r.error?.message ?? null })
  }
  return probes
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

// Each module schema is mirrored into `public` as security-invoker views, so
// the module is reachable without touching Exposed Schemas. The view runs as
// the caller, so the base table's RLS still decides every row.
const BRIDGE_PREFIX = { core: 'core_', empowercare: 'ec_', melrah: 'ml_' }

function isUnexposed(error) {
  return error?.code === 'PGRST106' ||
    /schema must be one of|Invalid schema/i.test(error?.message ?? '')
}

/**
 * Read from a module table. Prefers the direct schema when the Data API
 * exposes it, and otherwise falls back to the public bridge view.
 *
 * Returns { data, error, unexposed, via }. `unexposed` is only true when BOTH
 * paths are unavailable — a genuine configuration gap worth naming on screen
 * rather than rendering an empty table that reads as a missing feature.
 */
export async function fromModuleSchema(schema, table, build = q => q) {
  try {
    const direct = await build(supabase.schema(schema).from(table).select('*'))
    if (!direct.error) {
      return { data: direct.data ?? [], error: null, unexposed: false, via: 'schema' }
    }
    if (!isUnexposed(direct.error)) {
      return { data: null, error: direct.error, unexposed: false, via: 'schema' }
    }

    const prefix = BRIDGE_PREFIX[schema]
    if (!prefix) return { data: null, error: direct.error, unexposed: true, via: 'none' }

    const bridged = await build(supabase.from(`${prefix}${table}`).select('*'))
    if (bridged.error) {
      // Bridge view missing entirely => the module really is unreachable.
      const missing = bridged.error.code === 'PGRST205' || isUnexposed(bridged.error)
      return { data: null, error: bridged.error, unexposed: missing, via: 'bridge' }
    }
    return { data: bridged.data ?? [], error: null, unexposed: false, via: 'bridge' }
  } catch (e) {
    return { data: null, error: e, unexposed: false, via: 'none' }
  }
}

export const SCHEMA_HELP =
  'This module’s tables exist in the database, but neither the schema nor its ' +
  'public bridge views are reachable from the API. An administrator can add ' +
  'the schema in Dashboard → Project Settings → API → Exposed schemas, or ' +
  're-apply the bridge-view migration. Row Level Security already protects ' +
  'these tables, so neither route widens access.'
