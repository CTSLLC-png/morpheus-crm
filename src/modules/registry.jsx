// src/modules/registry.jsx
// ── Morpheus OS — module registry ──────────────────────────────

import { lazy } from 'react'

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
  'logistics.dispatch': {
    nav: [{ path: '/dispatch', label: 'Operations Control', icon: 'chart', order: 92 }],
    component: lazy(() => import('./melrah/Dispatch.jsx')),
  },
  'logistics.field': {
    nav: [{ path: '/field', label: 'MELRAH FIELD', icon: 'clipboard', order: 94 }],
    component: lazy(() => import('./melrah/FieldMobile.jsx')),
  },
  'logistics.stations': {
    nav: [{ path: '/stations', label: 'Collection Stations', icon: 'box', order: 96 }],
    component: lazy(() => import('./melrah/Stations.jsx')),
  },
  'logistics.recovery': {
    nav: [{ path: '/recovery', label: 'Recovery Intelligence', icon: 'chart', order: 98 }],
    component: lazy(() => import('./melrah/Recovery.jsx')),
  },
  'quality.inventory': {
    nav: [{ path: '/inventory', label: 'Inventory & QC', icon: 'box', order: 100 }],
    component: lazy(() => import('./melrah/Inventory.jsx')),
  },
}

export function resolveModules(modules) {
  return (modules ?? [])
    .map(m => ({ ...m, impl: MODULE_REGISTRY[m.key] ?? null }))
    .filter(m => m.impl !== null)
}

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
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
}

export function routableModules(modules) {
  return resolveModules(modules).filter(m => !m.impl.native && m.impl.component)
}
