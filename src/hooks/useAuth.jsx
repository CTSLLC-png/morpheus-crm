// src/hooks/useAuth.jsx
// ── Morpheus CRM — Auth context & hook ─────────────────────────
//
// The role exposed here comes from app_metadata (see lib/supabase.js) or, when
// app_metadata has nothing the app recognises, from a database-confirmed
// membership (see lib/identity.js). It never comes from user_metadata, which
// the user can write to themselves.

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { resolveIdentity } from '../lib/identity.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser]       = useState(null)
  // 'super_admin' | 'trainer' | 'participant' | 'vendor' | null
  const [role, setRole]       = useState(null)
  // 'metadata' | 'membership' | 'none' — how `role` was established. Surfaced
  // so the staff admin screen can show which accounts are running on the
  // fallback and therefore still need their app_metadata stamped.
  const [roleBasis, setRoleBasis]         = useState('none')
  const [participantId, setParticipantId] = useState(null)
  const [vendorId, setVendorId]           = useState(null)
  const [loading, setLoading]             = useState(true)

  // Guards against a slow resolve for an old session overwriting a newer one.
  const hydrationRef = useRef(0)

  const hydrate = useCallback(async (nextSession) => {
    const token = ++hydrationRef.current
    setSession(nextSession)
    const u = nextSession?.user ?? null
    setUser(u)

    if (!u) {
      setRole(null); setRoleBasis('none')
      setParticipantId(null); setVendorId(null)
      setLoading(false)
      return
    }

    let identity
    try {
      identity = await resolveIdentity(u)
    } catch {
      // A failed lookup must not masquerade as "no such user". Leave the role
      // unresolved; the router sends them to the enrolment screen, which is
      // recoverable, rather than to a shell they may not be entitled to.
      identity = { role: null, basis: 'none', participantId: null, vendorId: null }
    }

    if (token !== hydrationRef.current) return   // a newer hydrate won

    setRole(identity.role)
    setRoleBasis(identity.basis)
    setParticipantId(identity.participantId)
    setVendorId(identity.vendorId)
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => hydrate(session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => { hydrate(session) }
    )
    return () => subscription.unsubscribe()
  }, [hydrate])

  /**
   * Re-run identity resolution against the current session.
   *
   * Registration needs this: redeeming an enrolment code creates the
   * participants row *after* the session already exists, so without a
   * re-resolve the user would sit on the enrolment screen holding a perfectly
   * good participant record.
   */
  const refreshIdentity = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    await hydrate(session)
  }, [hydrate])

  const value = {
    session, user, role, roleBasis, participantId, vendorId, loading,
    refreshIdentity,
    isTrainer:     role === 'trainer' || role === 'super_admin',
    isParticipant: role === 'participant',
    isAdmin:       role === 'super_admin',
    isVendor:      role === 'vendor',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
