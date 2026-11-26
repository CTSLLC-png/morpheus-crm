// src/lib/activeTenant.js
// ── Morpheus OS — the tenant the signed-in user is working in ──
//
// Module data (Creator Studio, Campaign Studio, Artist Hub, …) carries a
// tenant_id and the database only lets a user touch rows of tenants they
// belong to (sql/0021_tenant_scope_growth_modules.sql). Module API files use
// these helpers so every new row is filed under the tenant picked in the
// shell, and lists show only that tenant even for someone in several.
//
// TenantProvider keeps this in step with the selected tenant. With no
// tenant resolved (kernel unreachable) nothing is stamped and the database
// default (CTS, for CTS members only) applies.

let current = null

export function setActiveTenant(id) {
  current = id || null
}

export function activeTenantId() {
  return current
}

/** Adds tenant_id to a row, or to each row of an array. */
export function withTenant(rows) {
  if (!current) return rows
  return Array.isArray(rows) ? rows.map(r => ({ ...r, tenant_id: current })) : { ...rows, tenant_id: current }
}

/** Narrows a Supabase query to the active tenant. */
export function scoped(query) {
  return current ? query.eq('tenant_id', current) : query
}

/** Storage folder for the active tenant's files ('' when none). */
export function tenantFolder() {
  return current ? `${current}/` : ''
}
