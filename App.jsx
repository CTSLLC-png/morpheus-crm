// src/App.jsx
// ── Morpheus CRM — Root router with auth-aware routing ──────────

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import Login from './pages/Login.jsx'

// Lazy-loaded shells (prevents bundle bloat on login screen)
import { lazy, Suspense } from 'react'
const TrainerShell     = lazy(() => import('./pages/TrainerShell.jsx'))
const ParticipantShell = lazy(() => import('./pages/ParticipantShell.jsx'))
const ResetPassword    = lazy(() => import('./pages/ResetPassword.jsx'))

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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/login"          element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
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
    </AuthProvider>
  )
}
