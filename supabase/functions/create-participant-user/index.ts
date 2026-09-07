// supabase/functions/create-participant-user/index.ts
// ── Morpheus CRM — staff creates a participant login ────────────
//
// ===================================================================
// PROVENANCE
// ===================================================================
// This function was DEPLOYED to production (version 2) but absent from the
// repository — there was no way to review it, diff it, or know what it did
// without querying the platform. This file is the deployed source, corrected.
// Do not delete it from the repo again.
//
// Contract is unchanged, so src/pages/ParticipantIntake.jsx needs no edit:
//   POST { email, password | temp_password, full_name? }
//   ->   200 { user: { id, email } }
//
// ===================================================================
// WHAT CHANGED FROM THE DEPLOYED VERSION
// ===================================================================
// 1. The role is written to app_metadata, not just user_metadata. The
//    deployed version wrote user_metadata only, so every participant it
//    created had a role public.current_user_role() could not see. Participants
//    happened to keep working because participant RLS keys off
//    public.current_participant_id() (participants.user_id = auth.uid()) and
//    not off the role — an accident, not a design.
//
// 2. PRIVILEGE ESCALATION FIXED. The deployed version authorized its caller
//    with `callerData.user.user_metadata?.role`. user_metadata is writable by
//    the end user with the anon key:
//
//        supabase.auth.updateUser({ data: { role: 'trainer' } })
//
//    Any signed-in participant could therefore make themselves a trainer in
//    their own metadata and then call this endpoint to mint accounts. The
//    check now reads app_metadata (see _shared/roles.ts, requireCaller),
//    which only the service role can write.
//    ** create-morpheus-user has, or had, the identical hole — it gates on
//       user_metadata.role === 'super_admin'. Deploy both. **
//
// 3. It no longer confirms or denies whether an email is already registered
//    to an unauthenticated request — the caller must be staff before it will
//    say anything at all. (It already required that; the ordering is now
//    explicit.)
//
// ===================================================================
// DEPLOYING
// ===================================================================
//   supabase functions deploy create-participant-user
// (verify_jwt stays ON — this endpoint requires a signed-in staff caller.)

import {
  adminClient, requireCaller, stampRole, json, corsHeaders,
} from '../_shared/roles.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const admin = adminClient()

    const caller = await requireCaller(admin, req, ['trainer', 'super_admin'])
    if ('error' in caller) return caller.error

    const body = await req.json().catch(() => ({}))
    const email: string | undefined = body.email
    const password: string | undefined = body.password ?? body.temp_password
    const fullName: string | undefined = body.full_name ?? body.fullName

    if (!email || !password) {
      return json({ error: 'Email and temporary password are required' }, 400)
    }

    // Creates the auth user ONLY. The participants row is inserted by the
    // caller (ParticipantIntake.jsx), which is where the programme source,
    // cohort and intake fields live. Keep it that way — duplicating the insert
    // here is how you end up with two participants for one login.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : {},
    })
    if (createErr || !created?.user) {
      return json({ error: createErr?.message ?? 'Failed to create auth user' }, 400)
    }

    // The grant. If this fails the account exists but has no role, so delete
    // it rather than hand back a half-made user the caller will treat as good.
    try {
      await stampRole(admin, created.user.id, 'participant',
        fullName ? { full_name: fullName } : {})
    } catch (e) {
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: `Could not set the account role: ${(e as Error).message}` }, 500)
    }

    return json({ user: { id: created.user.id, email: created.user.email } })
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Unexpected error' }, 500)
  }
})
