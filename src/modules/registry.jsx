// src/modules/registry.jsx
// ── Nguzo OS — module registry ──────────────────────────────

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
  'growth.campaigns': {
    nav: [{ path: '/campaigns', label: 'Campaign Studio', icon: 'chart', order: 75 }],
    component: lazy(() => import('./growth/CampaignStudio.jsx')),
  },
  'growth.studio': {
    nav: [{ path: '/creator-studio', label: 'Creator Studio', icon: 'monitor', order: 76 }],
    component: lazy(() => import('./studio/CreatorStudio.jsx')),
  },
  'media.artist': {
    nav: [{ path: '/artist-hub', label: 'Artist Hub', icon: 'monitor', order: 77 }],
    component: lazy(() => import('./artist/ArtistHub.jsx')),
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
    .flatMap(m => (m.impl.nav ?? []).map(item => ({
      ...item, moduleKey: m.key, moduleName: m.name, family: m.family ?? null,
    })))
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
}

/**
 * The same navigation, grouped by product family for the sidebar.
 *
 * The grouping is DATA: it comes from core.module.family, which is
 * 'clearcall' for workforce.cer and workforce.empowercare and NULL for
 * everything else including workforce.academy. There is deliberately no
 * hardcoded list of module keys here — adding a module to ClearCall is a
 * database change, not a code change.
 *
 * `families` is core.product_family, used only for the heading text. A family
 * key with no row still groups correctly and labels itself from the key, so a
 * missing or unreadable product_family row degrades the label and nothing
 * else.
 *
 * Explicit nav `order` is preserved in two ways: items inside a group stay in
 * order, and a group sits where its first item would have sat. So Dashboard
 * (order 10, family clearcall) still comes first and Claude Academy (order
 * 30, no family) still follows the CER items.
 *
 * Returns [{ key, name, items }] where key is null for the ungrouped block.
 */
export function navGroupsForModules(modules, families = []) {
  const items = navForModules(modules)
  const nameFor = new Map((families ?? []).map(f => [f.key, f.name]))

  const groups = []
  const byKey = new Map()

  for (const item of items) {
    const key = item.family ?? null
    // Ungrouped items are not one block: each sits at its own position, so a
    // family group cannot drag an unrelated tab along with it.
    const bucketKey = key === null ? `__solo-${groups.length}` : key
    if (!byKey.has(bucketKey)) {
      const group = {
        key,
        name: key === null ? null : (nameFor.get(key) ?? titleise(key)),
        items: [],
      }
      byKey.set(bucketKey, group)
      groups.push(group)
    }
    byKey.get(bucketKey).items.push(item)
  }
  return groups
}

function titleise(key) {
  return String(key).replace(/[-_.]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function routableModules(modules) {
  return resolveModules(modules).filter(m => !m.impl.native && m.impl.component)
}
