// src/App.jsx
// ── Morpheus CRM — Root router with auth-aware routing ──────────

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import { TenantProvider } from './hooks/useTenant.jsx'
import Login from './pages/Login.jsx'

// Lazy-loaded shells (prevents bundle bloat on login screen)
import { lazy, Suspense, useEffect, useState } from 'react'
const TrainerShell     = lazy(() => import('./pages/TrainerShell.jsx'))
const ParticipantShell = lazy(() => import('./pages/ParticipantShell.jsx'))
const ResetPassword    = lazy(() => import('./pages/ResetPassword.jsx'))
const VerifyCredential = lazy(() => import('./pages/VerifyCredential.jsx'))

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0D1B2A',
      fontFamily: "'DM Mono', monospace", color: '#5DCAA5', fontSize: '14px',
    }}>
      M.orpheus loading…
    </div>
  )
}

/** Redirects to /login if not authenticated */
function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  return children
}

/** Routes trainer/admin to TrainerShell, participants to ParticipantShell */
function RoleRouter() {
  const { role, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (role === 'participant') return <ParticipantShell />
  if (role === 'trainer' || role === 'super_admin') return <TrainerShell />
  // Unknown role — sign out and back to login
  return <Navigate to="/login" replace />
}

/**
 * A single-page app never reloads, so the document title stays frozen on the
 * first page a user landed on and a screen reader is told nothing when the
 * view changes. This keeps the title in step with the route and announces the
 * new page, which is how a screen reader user knows navigation happened.
 */
function RouteAnnouncer() {
  const location = useLocation()
  const [page, setPage] = useState('')

  useEffect(() => {
    const name = PAGE_TITLES[location.pathname]
      ?? Object.entries(PAGE_TITLES).find(([p]) => p !== '/' && location.pathname.startsWith(p))?.[1]
      ?? 'Morpheus'
    document.title = `${name} — Morpheus · Certified Training Standards`
    setPage(name)

    // Focus the main region so the next Tab press continues from the new page
    // rather than from wherever the old page's focus happened to be.
    const main = document.getElementById('main-content')
    if (main) main.focus({ preventScroll: true })
  }, [location.pathname])

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {page ? `${page} page loaded` : ''}
    </div>
  )
}

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/simulator': 'AI Call Simulator',
  '/calls': 'Practice calls',
  '/academy': 'Claude Academy',
  '/participants': 'Participants',
  '/cohorts': 'Cohorts and reports',
  '/matrix': 'Score Matrix',
  '/admin': 'Admin panel',
  '/login': 'Sign in',
  '/reset-password': 'Reset password',
  '/verify': 'Verify a credential',
}

export default function App() {
  return (
    <AuthProvider>
      <TenantProvider>
      <BrowserRouter>
        <RouteAnnouncer />
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/login"          element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* MORPHEUS.EDU — public credential verification (no auth) */}
            <Route path="/verify"         element={<VerifyCredential />} />
            <Route path="/verify/:code"   element={<VerifyCredential />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <RoleRouter />
                </RequireAuth>
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
      </TenantProvider>
    </AuthProvider>
  )
}
