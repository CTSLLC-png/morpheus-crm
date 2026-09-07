// src/modules/registry.jsx
// ── Morpheus OS — module registry ──────────────────────────────
//
// Maps a core.module.key to the navigation it contributes and the component
// that renders it. This file is the ONLY place the shell learns what a module
// looks like, and a module appears in the sidebar only when the tenant has it
// enabled in core.tenant_module.
//
// Adding a business line = one entry here + one core.module row. It must never
// mean editing the sidebar.

import { lazy } from 'react'

// `workforce.cer` predates the registry and its routes need shell-level data
// (stats, cohorts, participants). It declares its navigation here but keeps
// rendering natively inside TrainerShell — marked `native: true` — so
// generalising the shell carries no risk of regressing the one module that
// users rely on today.
// `order` places an item in the sidebar. Without it items would be grouped
// strictly by module, in whatever order the modules happened to arrive.
// Ordering is a presentation concern, so it lives here rather than in
// core.module.sort_order.
//
// `order` still does all the ordering work now that the sidebar is split into
// product-family sections: it orders items inside a section, and the lowest
// order in a section is what orders the sections themselves. One consequence
// is unavoidable and was accepted deliberately — Claude Academy (order 30) no
// longer sits between the CER items, because grouping requires the ClearCall
// items to be contiguous. It moves to the head of the ungrouped CTS section
// directly below them.
const CER_NAV = [
  { path: '/',             label: 'Dashboard',         icon: 'grid',    order: 10 },
  { path: '/simulator',    label: 'AI Call Simulator', icon: 'monitor', order: 20 },
  { path: '/participants', label: 'Participants',      icon: 'users',   order: 40 },
  { path: '/cohorts',      label: 'Cohorts & Reports', icon: 'chart',   order: 50 },
  { path: '/matrix',       label: 'Score Matrix',      icon: 'table',   order: 60 },
]

// ── Product families (brand groupings) ────────────────────────────────
//
// A family is presentational: it puts several modules under one heading in
// the sidebar. It is NOT a tenant and NOT an entitlement — CER and
// EmpowerCare both live in the `cts` tenant and are still enabled one
// core.tenant_module row at a time.
//
// The database is the source of truth: core.module.family (sql/0004). This
// map only supplies the DISPLAY NAME for a family key, so a family the
// database knows about but this build does not still renders (under its raw
// key) instead of vanishing — the same never-lock-the-user-out rule that
// governs missingModules() below.
export const PRODUCT_FAMILIES = {
  clearcall: { name: 'ClearCall' },
}

/**
 * Which family a module belongs to.
 *
 * core.module.family wins whenever it is set. The `family` declared on a
 * registry entry is a pre-migration default only: sql/0004 has to be reviewed
 * and applied by a human, and until it is, every module arrives with
 * family = undefined and the sidebar would show no grouping at all.
 *
 * The trade-off, stated plainly: once 0004 is applied, clearing family on a
 * module in the database will NOT un-group it in this build, because the
 * registry default takes over again. Un-grouping CER or EmpowerCare therefore
 * means deleting the `family` line here too. That is the safe direction to
 * fail — the grouping the business asked for survives a partial rollout.
 */
function familyOf(module) {
  return module.family ?? MODULE_REGISTRY[module.key]?.family ?? null
}

export const MODULE_REGISTRY = {
  'workforce.cer': {
    native: true,
    family: 'clearcall',
    nav: CER_NAV,
  },
  // Claude Academy (MORPHEUS.EDU). Like CER it predates the registry and its
  // route needs shell-level data (staffProfileId), so it stays `native` and
  // keeps rendering inside TrainerShell. Registering it here is what puts it
  // back in the sidebar now that navigation is data-driven — a module that
  // exists in core.module but not here would silently vanish from the nav.
  //
  // No `family`: Claude Academy / CAP-C is a CTS product, not a ClearCall
  // one, and must present OUTSIDE the ClearCall group. Do not "tidy" this by
  // giving it one.
  'workforce.academy': {
    native: true,
    nav: [{ path: '/academy', label: 'Claude Academy', icon: 'book', order: 30 }],
  },
  'workforce.empowercare': {
    family: 'clearcall',
    nav: [{ path: '/empowercare', label: 'EmpowerCare', icon: 'badge', order: 70 }],
    component: lazy(() => import('./empowercare/index.jsx')),
  },
  'logistics.accounts': {
    nav: [{ path: '/networks', label: 'Provider Networks', icon: 'network', order: 80 }],
    component: lazy(() => import('./melrah/Accounts.jsx')),
  },
  'logistics.workorders': {
    nav: [{ path: '/work-orders', label: 'Work Orders', icon: 'clipboard', order: 90 }],
    component: lazy(() => import('./melrah/WorkOrders.jsx')),
  },
  'quality.inventory': {
    nav: [{ path: '/inventory', label: 'Inventory & QC', icon: 'box', order: 100 }],
    component: lazy(() => import('./melrah/Inventory.jsx')),
  },
}

/** Modules the tenant enabled, in registry order, that we can actually render. */
export function resolveModules(modules) {
  return (modules ?? [])
    .map(m => ({ ...m, impl: MODULE_REGISTRY[m.key] ?? null }))
    .filter(m => m.impl !== null)
}

/**
 * Registered in core.module but absent from this file. Two very different
 * cases, and conflating them is how a shipped module silently disappears:
 *
 *  - PLANNED  → genuinely not built. A roadmap item. Show it quietly.
 *  - AVAILABLE → someone shipped this module and this build does not know
 *    about it. That is a BUG in this file, not a roadmap item, and it must be
 *    loud. Claude Academy hit exactly this: it was added to core.module and
 *    wired into main while this branch was open, so a build without a registry
 *    entry dropped it from the sidebar with no error anywhere.
 */
export function unimplementedModules(modules) {
  return (modules ?? []).filter(m => !MODULE_REGISTRY[m.key])
}

export function plannedModules(modules) {
  return unimplementedModules(modules).filter(m => m.status !== 'AVAILABLE')
}

export function missingModules(modules) {
  const missing = unimplementedModules(modules).filter(m => m.status === 'AVAILABLE')
  if (missing.length && typeof console !== 'undefined') {
    console.error(
      '[morpheus] Modules are enabled and AVAILABLE but missing from MODULE_REGISTRY — ' +
      'they will not appear in navigation: ' + missing.map(m => m.key).join(', ')
    )
  }
  return missing
}

export function navForModules(modules) {
  return resolveModules(modules)
    .flatMap(m => (m.impl.nav ?? []).map(item => ({
      ...item,
      moduleKey: m.key,
      moduleName: m.name,
      family: familyOf(m),
    })))
    // Sort by the item's own `order` so modules interleave into one coherent
    // sidebar. Items without an order fall to the end in registry order.
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
}

const LAST = 9999

/**
 * The sidebar as SECTIONS: one per product family, plus one ungrouped
 * section for everything with no family.
 *
 * `order` still does all the ordering work, exactly as before — this only
 * changes how the already-ordered items are bucketed:
 *
 *   * inside a section, items are sorted by their own `order`;
 *   * sections are sorted by the lowest `order` in each of them.
 *
 * So on the `cts` tenant ClearCall leads (Dashboard is order 10) and the
 * ungrouped CTS section follows (Claude Academy, order 30). On a tenant with
 * no families — melrah today — there is exactly one ungrouped section and the
 * sidebar is byte-for-byte what it was before.
 *
 * `extras` are shell-owned items that belong to no module (the Admin panel).
 * They are ungrouped and, having no `order`, sort last.
 */
export function navSectionsForModules(modules, extras = []) {
  const items = [...navForModules(modules), ...extras]
  const sections = new Map()

  for (const item of items) {
    const key = item.family ?? null
    if (!sections.has(key)) {
      sections.set(key, {
        key,
        // A null name means "render this section under the tenant's own
        // name", which is what the sidebar header already did for everything.
        name: key ? (PRODUCT_FAMILIES[key]?.name ?? key) : null,
        items: [],
      })
    }
    sections.get(key).items.push(item)
  }

  return [...sections.values()]
    .map(s => ({
      ...s,
      items: [...s.items].sort((a, b) => (a.order ?? LAST) - (b.order ?? LAST)),
    }))
    .map(s => ({ ...s, order: s.items[0]?.order ?? LAST }))
    .sort((a, b) => a.order - b.order)
}

export function routableModules(modules) {
  return resolveModules(modules).filter(m => !m.impl.native && m.impl.component)
}
