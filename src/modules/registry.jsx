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
// `order` places an item in the combined sidebar. Without it the sidebar would
// be grouped strictly by module, which would move Claude Academy from its
// long-standing third position down below CER's five items. Ordering is a
// presentation concern, so it lives here rather than in core.module.sort_order.
const CER_NAV = [
  { path: '/',             label: 'Dashboard',         icon: 'grid',    order: 10 },
  { path: '/simulator',    label: 'AI Call Simulator', icon: 'monitor', order: 20 },
  { path: '/participants', label: 'Participants',      icon: 'users',   order: 40 },
  { path: '/cohorts',      label: 'Cohorts & Reports', icon: 'chart',   order: 50 },
  { path: '/matrix',       label: 'Score Matrix',      icon: 'table',   order: 60 },
]

export const MODULE_REGISTRY = {
  'workforce.cer': {
    native: true,
    nav: CER_NAV,
  },
  // Claude Academy (MORPHEUS.EDU). Like CER it predates the registry and its
  // route needs shell-level data (staffProfileId), so it stays `native` and
  // keeps rendering inside TrainerShell. Registering it here is what puts it
  // back in the sidebar now that navigation is data-driven — a module that
  // exists in core.module but not here would silently vanish from the nav.
  'workforce.academy': {
    native: true,
    nav: [{ path: '/academy', label: 'Claude Academy', icon: 'book', order: 30 }],
  },
  'workforce.empowercare': {
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
    .flatMap(m => (m.impl.nav ?? []).map(item => ({ ...item, moduleKey: m.key, moduleName: m.name })))
    // Sort by the item's own `order` so modules interleave into one coherent
    // sidebar. Items without an order fall to the end in registry order.
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
}

export function routableModules(modules) {
  return resolveModules(modules).filter(m => !m.impl.native && m.impl.component)
}
