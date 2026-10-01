// src/hooks/useTenant.jsx
// ── Morpheus OS — tenant + module context ──────────────────────
//
// Resolves the signed-in user's tenants once, holds the selected one, and
// exposes the modules that tenant has enabled. Components read from here
// instead of reaching for tenant ids ad hoc.

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { loadWorkspace } from '../lib/morpheus.js'

const TenantContext = createContext(null)
const STORAGE_KEY = 'morpheus.tenant'

/**
 * If the kernel is unreachable the shell must not go blank — CER lives in the
 * `public` schema and has always worked without the registry, so it stands in
 * as the minimum viable workspace.
 */
const FALLBACK_TENANT = {
  id: null,
  slug: 'cts',
  name: 'Certified Training Standards',
  legalEntity: 'Certified Training Standards LLC',
  industry: 'Workforce development',
  status: 'ACTIVE',
  role: null,
  modules: [{
    key: 'workforce.cer',
    name: 'CER Certification',
    description: 'Certified Customer Experience Representative',
    schema: 'public',
    category: 'workforce',
    status: 'AVAILABLE',
    sortOrder: 10,
    enabled: true,
    config: {},
  }],
}

export function TenantProvider({ children }) {
  const { session, loading: authLoading } = useAuth()
  const [tenants, setTenants] = useState([])
  const [tenantId, setTenantId] = useState(() => localStorage.getItem(STORAGE_KEY))
  const [source, setSource] = useState(null)
  const [kernelError, setKernelError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (authLoading) return
    if (!session) { setTenants([]); setLoading(false); return }

    setLoading(true)
    loadWorkspace().then(({ tenants, source, error }) => {
      if (cancelled) return
      const resolved = tenants.length ? tenants : [FALLBACK_TENANT]
      setTenants(resolved)
      setSource(tenants.length ? source : 'fallback')
      setKernelError(error)
      setTenantId(prev =>
        prev && resolved.some(t => t.id === prev) ? prev : resolved[0].id
      )
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [session, authLoading])

  useEffect(() => {
    if (tenantId) localStorage.setItem(STORAGE_KEY, tenantId)
  }, [tenantId])

  const tenant = useMemo(
    () => tenants.find(t => t.id === tenantId) ?? tenants[0] ?? null,
    [tenants, tenantId]
  )

  // Only modules the tenant enabled AND that are actually shippable.
  // A PLANNED module (ParentPlug today) has a registry row but no schema —
  // rendering a tab for it would promise something that does not exist.
  const modules = useMemo(
    () => (tenant?.modules ?? []).filter(m => m.enabled && m.status === 'AVAILABLE'),
    [tenant]
  )

  const value = {
    loading, tenants, tenant, tenantId, modules,
    source, kernelError,
    isMultiTenant: tenants.length > 1,
    selectTenant: setTenantId,
    hasModule: key => modules.some(m => m.key === key),
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used inside <TenantProvider>')
  return ctx
}
