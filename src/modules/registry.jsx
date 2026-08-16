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
const CER_NAV = [
  { path: '/',             label: 'Dashboard',         icon: 'grid'    },
  { path: '/simulator',    label: 'AI Call Simulator', icon: 'monitor' },
  { path: '/participants', label: 'Participants',      icon: 'users'   },
  { path: '/cohorts',      label: 'Cohorts & Reports', icon: 'chart'   },
  { path: '/matrix',       label: 'Score Matrix',      icon: 'table'   },
]

export const MODULE_REGISTRY = {
  'workforce.cer': {
    native: true,
    nav: CER_NAV,
  },
  'workforce.empowercare': {
    nav: [{ path: '/empowercare', label: 'EmpowerCare', icon: 'badge' }],
    component: lazy(() => import('./empowercare/index.jsx')),
  },
  'logistics.accounts': {
    nav: [{ path: '/networks', label: 'Provider Networks', icon: 'network' }],
    component: lazy(() => import('./melrah/Accounts.jsx')),
  },
  'logistics.workorders': {
    nav: [{ path: '/work-orders', label: 'Work Orders', icon: 'clipboard' }],
    component: lazy(() => import('./melrah/WorkOrders.jsx')),
  },
  'quality.inventory': {
    nav: [{ path: '/inventory', label: 'Inventory & QC', icon: 'box' }],
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
 * Enabled in the registry but not built here yet — worth knowing about, but
 * never worth rendering a tab for. A tab that leads nowhere reads as a broken
 * product; an honest gap reads as a roadmap.
 */
export function unimplementedModules(modules) {
  return (modules ?? []).filter(m => !MODULE_REGISTRY[m.key])
}

export function navForModules(modules) {
  return resolveModules(modules).flatMap(m =>
    (m.impl.nav ?? []).map(item => ({ ...item, moduleKey: m.key, moduleName: m.name }))
  )
}

export function routableModules(modules) {
  return resolveModules(modules).filter(m => !m.impl.native && m.impl.component)
}
