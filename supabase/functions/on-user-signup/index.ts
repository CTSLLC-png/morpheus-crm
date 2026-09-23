// supabase/functions/on-user-signup/index.ts
// ── Morpheus CRM — Supabase Auth Hook (legacy / not currently deployed) ──
//
// SUPERSEDED: as of the fix_role_authorization_use_app_metadata migration,
// role defaulting is handled directly by a `set_default_participant_app_role`
// BEFORE INSERT trigger on auth.users, which runs for every signup path
// (including the direct supabase.auth.signUp() + redeem_cohort_invite flow
// this Edge Function was never wired into). That trigger is the source of
// truth now. This file is kept only in case an Auth Hook is registered
// against it in the future -- if so, it must NOT reintroduce the original
// vulnerability, so it's corrected to match the new architecture below.
//
// ORIGINAL BUG (fixed): this function used to read the role a user
// requested at signup from raw_user_meta_data (user_metadata) -- a field
// any client can set on themselves via supabase.auth.signUp()'s
// options.data -- validate only that the requested string was one of the
// three known role names, and then stamp that self-requested role back
// onto user_metadata using the service_role key. Since current_user_role()
// (used by nearly every RLS policy in this schema) read user_metadata,
// this meant any anonymous signup could request role: 'super_admin' and
// pass every authorization check in the app.
//
// FIX: never trust the role in raw_user_meta_data for anything beyond
// display. Only ever WRITE role into app_metadata (raw_app_meta_data),
// which is not client-writable, and ignore whatever the client requested.
// A hook is not the place to grant an elevated role at all -- elevation
// only happens through create-participant-user / create-morpheus-user,
// which require an already-authenticated trainer/super_admin caller.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    const { user } = body

    if (!user) {
      return new Response(JSON.stringify({ error: 'No user in payload' }), { status: 400 })
    }

    // Do NOT read a role from raw_user_meta_data here -- it is client-
    // writable and must never be trusted for authorization. Every signup
    // this hook sees is stamped as 'participant' in app_metadata, full
    // stop. Elevation to trainer/super_admin only ever happens through
    // create-participant-user / create-morpheus-user, which require an
    // authenticated trainer/super_admin caller and write app_metadata
    // directly with the service_role key.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { error } = await adminClient.auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.raw_app_meta_data, role: user.raw_app_meta_data?.role ?? 'participant' },
    })

    if (error) throw error

    return new Response(JSON.stringify({ role: 'participant' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
