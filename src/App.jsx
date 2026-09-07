// src/App.jsx
// ── Morpheus CRM — Root router with auth-aware routing ──────────

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import { TenantProvider } from './hooks/useTenant.jsx'
import Login from './pages/Login.jsx'

// Lazy-loaded shells (prevents bundle bloat on login screen)
import { lazy, Suspense } from 'react'
const TrainerShell     = lazy(() => import('./pages/TrainerShell.jsx'))
const ParticipantShell = lazy(() => import('./pages/ParticipantShell.jsx'))
const VendorShell      = lazy(() => import('./pages/VendorShell.jsx'))
const ResetPassword    = lazy(() => import('./pages/ResetPassword.jsx'))
const VerifyCredential = lazy(() => import('./pages/VerifyCredential.jsx'))
const Register         = lazy(() => import('./pages/Register.jsx'))
const FinishEnrolment  = lazy(() => import('./pages/FinishEnrolment.jsx'))

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

/**
 * Places a signed-in user in the right shell.
 *
 * `role` comes from useAuth, which resolves it from app_metadata — the surface
 * RLS actually enforces — or, when app_metadata has nothing the app
 * recognises, from a membership the database confirms (a participants row, or
 * an active vendor_user row). See src/lib/identity.js for why that fallback
 * exists and why it can only ever yield the two least-privileged roles.
 *
 * The old rule still holds: an unrecognised role is never granted access. What
 * changed is where it lands. `<Navigate to="/login">` from an authenticated
 * session is an infinite loop — /login sees a live session and sends them
 * back — so an unplaceable user goes to the enrolment screen instead, which
 * grants nothing beyond the redeem RPC any authenticated session can already
 * call, and gives them a way out.
 */
function RoleRouter() {
  const { role, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (role === 'participant') return <ParticipantShell />
  if (role === 'trainer' || role === 'super_admin') return <TrainerShell />
  if (role === 'vendor') return <VendorShell />
  return <FinishEnrolment />
}

export default function App() {
  return (
    <AuthProvider>
      <TenantProvider>
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/login"          element={<Login />} />
            {/* Participant self-registration. Deliberately NOT wrapped in an
                "anonymous only" guard: signUp creates a session halfway
                through, and bouncing on it would unmount the page before the
                enrolment code is redeemed. */}
            <Route path="/register"       element={<Register />} />
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
