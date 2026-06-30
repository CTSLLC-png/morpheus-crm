// src/hooks/useAuth.jsx
// ── Morpheus CRM — Auth context & hook ─────────────────────────

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, getUserRole } from '../lib/supabase.js'
import { getParticipantByUserId } from '../lib/db.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession]         = useState(null)
  const [user, setUser]               = useState(null)
  const [role, setRole]               = useState(null)           // 'super_admin' | 'trainer' | 'participant'
  const [participantId, setParticipantId] = useState(null)       // participants.id (if role=participant)
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    // Load initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      hydrate(session)
    })

    // Listen for login / logout / token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      hydrate(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function hydrate(session) {
    setSession(session)
    const u = session?.user ?? null
    setUser(u)
    const r = getUserRole(u)
    setRole(r)

    if (r === 'participant' && u) {
      try {
        const participant = await getParticipantByUserId(u.id)
        setParticipantId(participant?.id ?? null)
      } catch {
        setParticipantId(null)
      }
    } else {
      setParticipantId(null)
    }

    setLoading(false)
  }

  const value = { session, user, role, participantId, loading,
    isTrainer:    role === 'trainer' || role === 'super_admin',
    isParticipant: role === 'participant',
    isAdmin:      role === 'super_admin',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
