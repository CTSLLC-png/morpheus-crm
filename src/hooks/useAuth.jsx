// src/hooks/useAuth.jsx
// ── Nguzo OS — Auth context & hook ─────────────────────────
//
// SECURITY: `role` comes from getUserRole(), which reads app_metadata and
// nothing else. app_metadata is writable only by a trusted server (the
// service role, used by our edge functions and by the
// set_default_participant_app_role trigger on auth.users). user_metadata is
// writable by the account holder with the anon key, so it must never be
// branched on here or anywhere downstream — a user could otherwise hand
// themselves super_admin at signup via options.data.role.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase, getUserRole } from '../lib/supabase.js'
import { getParticipantByUserId } from '../lib/db.js'
import { recordSignIn } from '../lib/engagement.js'

const AuthContext = createContext(null)

/** Roles this build knows how to route. Anything else is NOT given access. */
export const KNOWN_ROLES = ['super_admin', 'trainer', 'participant', 'vendor', 'lp_customer']

export function AuthProvider({ children }) {
  const [session, setSession]         = useState(null)
  const [user, setUser]               = useState(null)
  const [role, setRole]               = useState(null)           // app_metadata.role, or null
  const [participantId, setParticipantId] = useState(null)       // participants.id, if any
  const [loading, setLoading]         = useState(true)

  // Latest participant id, for callers (sign-out telemetry) that need it
  // without re-rendering on it.
  const participantIdRef = useRef(null)

  const hydrate = useCallback(async (session) => {
    setSession(session)
    const u = session?.user ?? null
    setUser(u)
    const r = getUserRole(u)
    setRole(r)

    // The participants row is readable by its own account whatever role the
    // account carries ("Participants can read own record" is keyed on
    // user_id = auth.uid()), so this resolves for a role-less account too.
    // That is what lets the router tell "registered but never enrolled" apart
    // from "enrolled participant".
    let pid = null
    if (u && (r === 'participant' || !r)) {
      try {
        const participant = await getParticipantByUserId(u.id)
        pid = participant?.id ?? null
      } catch {
        pid = null
      }
    }
    participantIdRef.current = pid
    setParticipantId(pid)
    setLoading(false)
    return { user: u, role: r, participantId: pid }
  }, [])

  /**
   * Re-read the session and re-resolve identity.
   *
   * Used after redeeming an enrolment code: the participants row now exists,
   * and app_metadata may have changed server-side, which only lands in the
   * client after a token refresh. refreshSession() is best-effort — if it
   * fails we still re-resolve from the session we have.
   */
  const refreshIdentity = useCallback(async () => {
    let next = null
    try {
      const { data } = await supabase.auth.refreshSession()
      next = data?.session ?? null
    } catch {
      next = null
    }
    if (!next) {
      const { data } = await supabase.auth.getSession()
      next = data?.session ?? null
    }
    return hydrate(next)
  }, [hydrate])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { hydrate(session) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      hydrate(session).then(({ user, participantId }) => {
        // Engagement telemetry, fire and forget. Only a real sign-in counts:
        // INITIAL_SESSION is a page reload and TOKEN_REFRESHED is the library
        // doing housekeeping, and neither is a person arriving.
        if (event === 'SIGNED_IN' && user) recordSignIn(user.id, participantId)
      })
    })

    return () => subscription.unsubscribe()
  }, [hydrate])

  const value = {
    session, user, role, participantId, loading,
    participantIdRef,
    refreshIdentity,
    isTrainer:     role === 'trainer' || role === 'super_admin',
    isParticipant: role === 'participant',
    isAdmin:       role === 'super_admin',
    isVendor:      role === 'vendor',
    isKnownRole:   KNOWN_ROLES.includes(role),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
