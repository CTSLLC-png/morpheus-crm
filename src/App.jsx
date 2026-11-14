// src/App.jsx
// ── Nguzo OS — Root router with auth-aware routing ──────────

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import { TenantProvider } from './hooks/useTenant.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import PublicHome from './pages/PublicHome.jsx'
import { artistSlugForHost } from './modules/artist/artistCatalog.js'

// Lazy-loaded shells (prevents bundle bloat on login screen)
import { lazy, Suspense, useEffect, useState } from 'react'
const TrainerShell     = lazy(() => import('./pages/TrainerShell.jsx'))
const ParticipantShell = lazy(() => import('./pages/ParticipantShell.jsx'))
const VendorShell      = lazy(() => import('./pages/VendorShell.jsx'))
const FinishEnrolment  = lazy(() => import('./pages/FinishEnrolment.jsx'))
const ResetPassword    = lazy(() => import('./pages/ResetPassword.jsx'))
const VerifyCredential = lazy(() => import('./pages/VerifyCredential.jsx'))
// Legacy Path (CTS consumer module): legacy.morpheuscr.com, or /legacy/* here.
const LegacyRoutes     = lazy(() => import('./legacy/LegacyRoutes.jsx'))
const IS_LEGACY_HOST   = typeof window !== 'undefined' && window.location.hostname.startsWith('legacy.')
// Artist Hub public pages: <artist>.morpheuscr.com (e.g. jace.), or /artists/:slug here.
const ArtistPublicPage = lazy(() => import('./modules/artist/ArtistPublicPage.jsx'))
const ARTIST_HOST_SLUG = typeof window !== 'undefined' ? artistSlugForHost(window.location.hostname) : null

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
 * "/" is both the public home page and the staff/participant dashboard.
 * Signed-in users get their workspace; everyone else sees the public page.
 * Without this, signing in sent staff to "/" and showed the public page,
 * so the workspace was only reachable by typing another URL.
 */
function HomeGate() {
  const { session, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <PublicHome />
  return <RoleRouter />
}

/** Sends an already signed-in user straight to their workspace */
function LoginGate() {
  const { session, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (session) return <Navigate to="/" replace />
  return <Login />
}

/**
 * Registration is for someone with no account, so a visitor who arrives here
 * already signed in is sent to their workspace.
 *
 * But only if they were signed in when the screen OPENED. Registration signs
 * the new account in at step 1 and redeems the enrolment code at step 2; a
 * gate that redirected the moment a session appeared would tear the form away
 * between the two and leave exactly the stranded account — signed in, no
 * participants row, no cohort — that this work exists to prevent. So the
 * answer is latched on first settle and does not change underneath the form.
 */
function RegisterGate() {
  const { session, loading } = useAuth()
  const [alreadySignedIn, setAlreadySignedIn] = useState(null)

  useEffect(() => {
    if (loading || alreadySignedIn !== null) return
    setAlreadySignedIn(Boolean(session))
  }, [loading, session, alreadySignedIn])

  if (loading || alreadySignedIn === null) return <LoadingScreen />
  if (alreadySignedIn) return <Navigate to="/" replace />
  return <Register />
}

/**
 * Sends a signed-in user to the workspace their role entitles them to.
 *
 * `role` is app_metadata.role and nothing else — see getUserRole() in
 * lib/supabase.js. user_metadata is writable by the account holder with the
 * anon key, so it is never consulted here.
 *
 * THE RULE THAT DOES NOT BEND: an unrecognised role is never granted access.
 * It is also never sent to /login, which from a signed-in session is an
 * infinite redirect — you are already authenticated, so /login bounces you
 * straight back to "/". That loop was the previous behaviour for three
 * different situations, and it is what the cases below replace:
 *
 *   * no role at all in app_metadata -> FinishEnrolment("no-role"). They can
 *     redeem an enrolment code, which every authenticated session may already
 *     do and which is itself the gate; it grants nothing a code would not.
 *     If redemption succeeds and the account still has no routable role, that
 *     screen says so plainly instead of looping.
 *   * role 'participant' but no participants row (a registration whose code
 *     never redeemed) -> FinishEnrolment("no-participant"), the same single
 *     action. This is not a widening: the role is already theirs.
 *   * any other role this build does not know -> FinishEnrolment
 *     ("unknown-role"), which offers no code box at all, only an explanation
 *     and a sign-out. A dead end is the correct outcome: access nobody
 *     granted is not something a screen can fix.
 */
function RoleRouter() {
  const { role, participantId, loading } = useAuth()
  if (loading) return <LoadingScreen />

  // Legacy Path customers have no Nguzo access; send them to their app.
  if (role === 'lp_customer') return <Navigate to="/legacy/app" replace />
  if (role === 'trainer' || role === 'super_admin') return <TrainerShell />
  if (role === 'vendor') return <VendorShell />
  if (role === 'participant') {
    // ParticipantShell is built entirely around participants.id; without one
    // it renders an empty portal with no way out.
    return participantId ? <ParticipantShell /> : <FinishEnrolment reason="no-participant" />
  }
  if (!role) return <FinishEnrolment reason="no-role" />
  return <FinishEnrolment reason="unknown-role" />
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
      ?? 'Nguzo'
    document.title = `${name} — Nguzo · Certified Training Standards`
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
  '/': 'Nguzo OS',
  '/simulator': 'AI Call Simulator',
  '/calls': 'Practice calls',
  '/academy': 'Claude Academy',
  '/participants': 'Participants',
  '/cohorts': 'Cohorts and reports',
  '/matrix': 'Score Matrix',
  '/admin': 'Admin panel',
  '/enrolment-codes': 'Enrolment codes',
  '/partner-access': 'Partner access',
  '/empowercare': 'EmpowerCare',
  '/credentials': 'Credentials',
  '/login': 'Sign in',
  '/register': 'Create an account',
  '/reset-password': 'Reset password',
  '/verify': 'Verify a credential',
  '/legacy': 'Legacy Path',
  '/campaigns': 'Campaign Studio',
  '/creator-studio': 'Creator Studio',
  '/artist-hub': 'Artist Hub',
  '/artists': 'Artist',
}

export default function App() {
  if (ARTIST_HOST_SLUG) {
    return (
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="*" element={<ArtistPublicPage slug={ARTIST_HOST_SLUG} />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    )
  }
  if (IS_LEGACY_HOST) {
    return (
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/*" element={<LegacyRoutes base="" />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    )
  }
  return (
    <AuthProvider>
      <TenantProvider>
      <BrowserRouter>
        <RouteAnnouncer />
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/"               element={<HomeGate />} />
            <Route path="/login"          element={<LoginGate />} />
            {/* Invite-gated participant self-registration */}
            <Route path="/register"       element={<RegisterGate />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* NGUZO.EDU — public credential verification (no auth) */}
            <Route path="/verify"         element={<VerifyCredential />} />
            <Route path="/verify/:code"   element={<VerifyCredential />} />
            {/* Legacy Path — public module, its own sign-in and paywall */}
            <Route path="/legacy/*"       element={<LegacyRoutes base="/legacy" />} />
            {/* Artist Hub — public artist pages (no auth) */}
            <Route path="/artists/:slug"  element={<ArtistPublicPage />} />
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
