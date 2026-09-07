// supabase/functions/create-morpheus-user/index.ts
// ── Morpheus CRM — super admin creates any account ──────────────
//
// ===================================================================
// PROVENANCE — WHY THIS FILE APPEARED
// ===================================================================
// Like create-participant-user, this function was DEPLOYED to production but
// absent from the repository. It is invoked by src/pages/AdminPanel.jsx
// (`supabase.functions.invoke('create-morpheus-user', …)`), so it is the main
// way staff accounts get made — and there was no reviewable copy of it
// anywhere. This file is the deployed source, corrected.
//
// The brief for this work named only on-user-signup and create-participant-user.
// This one has the same two defects and is on the same critical path, so
// leaving it alone would have fixed the metadata split everywhere except the
// screen that creates administrators.
//
// ===================================================================
// WHAT CHANGED FROM THE DEPLOYED VERSION
// ===================================================================
// 1. PRIVILEGE ESCALATION FIXED. The deployed version authorized with
//        callerData.user.user_metadata?.role !== 'super_admin'
//    and user_metadata is writable by the end user with the anon key:
//        supabase.auth.updateUser({ data: { role: 'super_admin' } })
//    So ANY signed-in user of morpheuscr.com — including a participant — could
//    promote themselves in their own metadata and then use this endpoint to
//    create a real super_admin account with a password of their choosing, and
//    that account's app_metadata... would have been empty, so RLS would still
//    have refused it. The two bugs partially cancelled. Fixing the metadata
//    split without fixing this check would have uncancelled them and turned a
//    latent hole into a live one.
//    The check now reads app_metadata (see _shared/roles.ts, requireCaller).
//
// 2. The role is written to app_metadata as well as user_metadata, so
//    public.current_user_role() — and therefore every staff RLS policy —
//    can see it. Previously a trainer created here could not read the
//    participants table.
//
// 3. `vendor` is now a creatable role. A vendor account created here still
//    needs a public.vendor_user row before it can see anything: the role picks
//    the portal, the membership grants the data. Attach it in
//    Trainer shell -> Partner access.
//
// 4. normaliseRole no longer silently downgrades an unrecognised role to
//    'participant'. An operator who typos a role now gets an error instead of
//    quietly creating the wrong kind of account.
//
// ===================================================================
// DEPLOYING
// ===================================================================
//   supabase functions deploy create-morpheus-user
// (verify_jwt stays ON.)

import {
  adminClient, requireCaller, stampRole, normaliseRole,
  json, corsHeaders, ALLOWED_ROLES,
} from '../_shared/roles.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const admin = adminClient()

    const caller = await requireCaller(admin, req, ['super_admin'])
    if ('error' in caller) return caller.error

    // Tolerant key naming, kept from the deployed version so AdminPanel.jsx
    // and anything else already calling this keep working.
    const body = await req.json().catch(() => ({}))
    const email: string | undefined =
      body.email ?? body.email_address ?? body.emailAddress
    const password: string | undefined =
      body.password ?? body.temp_password ?? body.tempPassword ??
      body.temporary_password ?? body.temporaryPassword
    const fullName: string | undefined = body.full_name ?? body.fullName ?? body.name
    const programSource: string | undefined = body.program_source ?? body.programSource
    const title: string | undefined = body.title
    const phone: string | undefined = body.phone

    const role = normaliseRole(body.role ?? body.account_type ?? body.accountType ?? 'participant')
    if (!role) {
      return json({ error: `Unknown role. One of: ${ALLOWED_ROLES.join(', ')}` }, 400)
    }

    if (!email || !password || !fullName) {
      return json({ error: 'Missing required fields: full name, email, and password' }, 400)
    }
    if (role === 'participant' && !programSource) {
      return json({ error: 'Program source is required for participants' }, 400)
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (createErr || !created?.user) {
      return json({ error: createErr?.message ?? 'Failed to create auth user' }, 400)
    }
    const newUserId = created.user.id

    // The grant. Everything after this point rolls the account back on failure
    // rather than leaving a login nobody can place.
    try {
      await stampRole(admin, newUserId, role, { full_name: fullName })
    } catch (e) {
      await admin.auth.admin.deleteUser(newUserId)
      return json({ error: `Could not set the account role: ${(e as Error).message}` }, 500)
    }

    if (role === 'participant') {
      const { data: participant, error: pErr } = await admin
        .from('participants')
        .insert({ user_id: newUserId, full_name: fullName, program_source: programSource })
        .select('id, cts_id')
        .single()
      if (pErr) {
        await admin.auth.admin.deleteUser(newUserId)
        return json({ error: `Participant record failed: ${pErr.message}` }, 400)
      }
      return json({
        success: true, user_id: newUserId, participant_id: participant.id,
        cts_id: participant.cts_id, role,
      })
    }

    if (role === 'vendor') {
      // Deliberately no vendor_user row here. Which organisation this person
      // belongs to is a separate decision with its own audit trail
      // (vendor_user.added_by), made in Trainer shell -> Partner access.
      // Until that row exists the account signs in and is told, correctly,
      // that its access has not been set up.
      return json({
        success: true, user_id: newUserId, role,
        next: 'Attach this user to a partner organisation in Partner access before they can see anything.',
      })
    }

    const { data: staff, error: sErr } = await admin
      .from('staff_profiles')
      .insert({
        user_id: newUserId,
        full_name: fullName,
        title: title ?? (role === 'trainer' ? 'Trainer' : 'Super Admin'),
        phone: phone ?? null,
      })
      .select('id')
      .single()
    if (sErr) {
      await admin.auth.admin.deleteUser(newUserId)
      return json({ error: `Staff record failed: ${sErr.message}` }, 400)
    }
    return json({ success: true, user_id: newUserId, staff_id: staff.id, role })
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Unexpected error' }, 500)
  }
})
