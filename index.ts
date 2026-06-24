// supabase/functions/on-user-signup/index.ts
// ── Morpheus CRM — Supabase Auth Hook ──────────────────────────
// Deploy this as a Supabase Edge Function and register it as an
// Auth Hook: Dashboard → Authentication → Hooks → After user is created
//
// What it does:
// 1. Reads the "role" field passed in user metadata during signup
// 2. Validates it is a permitted role
// 3. Writes it back to user_metadata so RLS policies can read it
//
// To create a participant account from the trainer admin panel:
//   supabase.auth.admin.createUser({
//     email, password,
//     user_metadata: { role: 'participant' }
//   })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ROLES = ['super_admin', 'trainer', 'participant']

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    const { user } = body

    if (!user) {
      return new Response(JSON.stringify({ error: 'No user in payload' }), { status: 400 })
    }

    // Default to 'participant' if no role supplied
    const requestedRole = user.raw_user_meta_data?.role ?? 'participant'
    const role = ALLOWED_ROLES.includes(requestedRole) ? requestedRole : 'participant'

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Stamp the validated role back onto the user
    const { error } = await adminClient.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.raw_user_meta_data, role },
    })

    if (error) throw error

    return new Response(JSON.stringify({ role }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
