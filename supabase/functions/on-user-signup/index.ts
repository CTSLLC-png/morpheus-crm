// supabase/functions/on-user-signup/index.ts
// ── Morpheus CRM — stamp a role on a newly created auth user ────
//
// ===================================================================
// STATE OF PLAY, VERIFIED AGAINST PRODUCTION 2026-09-07
// ===================================================================
// This function is deployed nowhere and wired to nothing. There is no trigger
// on auth.users (`select * from pg_trigger` where the relation is auth.users
// returns zero non-internal rows) and no database webhook invoking it. Its
// previous header claimed it was registered as an "After user is created"
// Auth Hook; no such HTTP hook exists in Supabase Auth. So it has never run,
// and the four existing production accounts got their app_metadata some other
// way — by hand, most likely.
//
// That matters for how you wire it up (see DEPLOYING, below) and it matters
// for the app: nothing in the client may ASSUME this function ran. See
// src/lib/identity.js, which resolves a participant or vendor from
// database-confirmed membership when app_metadata is empty.
//
// ===================================================================
// WHAT IT DOES
// ===================================================================
// A user has just been created. Give them a role in app_metadata, which is
// the only place RLS can see one (see _shared/roles.ts for the full argument).
//
// It does NOT take the role from the signup payload. A self-registering
// participant sends `options.data` straight from the browser, so anything in
// raw_user_meta_data is attacker-controlled: honouring a `role` from there
// would let anyone with the anon key sign up as a super_admin. The old version
// did exactly that, guarded only by an allow-list that happened to contain
// `super_admin`.
//
// Instead the role is derived, in this order:
//   1. An existing app_metadata.role — already stamped by an admin path
//      (create-morpheus-user / create-participant-user). Never overwrite it.
//   2. An active public.vendor_user row for this user  -> 'vendor'.
//   3. Otherwise                                       -> 'participant'.
//
// Rules 2 and 3 are facts about the database, not claims by the user. Staff
// roles are deliberately unreachable from here: `trainer` and `super_admin`
// come only from create-morpheus-user, which requires an authenticated
// super_admin caller.
//
// ===================================================================
// DEPLOYING
// ===================================================================
//   supabase functions deploy on-user-signup --no-verify-jwt
//
// --no-verify-jwt is required: a database webhook posts with the service key,
// not a user JWT.
//
// Then wire it, in the Supabase dashboard:
//   Database -> Webhooks -> Create a new hook
//     Table:      auth.users
//     Events:     INSERT
//     Type:       Supabase Edge Functions -> on-user-signup
//     HTTP headers: Authorization: Bearer <SERVICE_ROLE_KEY>
//
// The webhook fires asynchronously, AFTER the user row is committed and after
// the client already holds a session. So there is a window in which a
// brand-new account has no role. That window is why the client resolves
// identity from the database rather than trusting metadata to be there.

import {
  adminClient, stampRole, normaliseRole, json, corsHeaders,
  type Role,
} from '../_shared/roles.ts'

/**
 * Accepts every shape this could plausibly arrive in, because the wiring is a
 * dashboard setting someone will change:
 *   database webhook   { type: 'INSERT', table: 'users', record: {...} }
 *   auth hook          { user: {...} }
 *   manual repair call { user_id: '...' }
 */
function extractUserId(body: Record<string, unknown>): string | null {
  const record = (body.record ?? body.user ?? body.new ?? {}) as Record<string, unknown>
  const id = record.id ?? body.user_id ?? body.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const userId = extractUserId(body)
    if (!userId) return json({ error: 'No user in payload' }, 400)

    const admin = adminClient()

    const { data: found, error: getErr } = await admin.auth.admin.getUserById(userId)
    if (getErr || !found?.user) return json({ error: 'No such user' }, 404)
    const user = found.user

    // 1. Already stamped by an admin path — leave it alone. This function must
    //    never demote a trainer to participant just because it fired twice.
    const existing = normaliseRole(user.app_metadata?.role)
    if (existing) {
      return json({ user_id: userId, role: existing, action: 'unchanged' })
    }

    // 2. Vendor membership is a fact a staff member created, so it is safe to
    //    derive a role from. Only ACTIVE vendors count, matching
    //    public.current_vendor_id().
    const { data: vendorRows } = await admin
      .from('vendor_user')
      .select('vendor_id, vendor:vendor_id(status)')
      .eq('user_id', userId)
      .limit(1)

    const isVendor = (vendorRows ?? []).some(
      (r: { vendor?: { status?: string } | null }) => r.vendor?.status === 'ACTIVE',
    )

    // 3. Default. Note what is NOT here: user.user_metadata.role. The browser
    //    wrote that, so it carries no authority.
    const role: Role = isVendor ? 'vendor' : 'participant'

    await stampRole(admin, userId, role)

    return json({ user_id: userId, role, action: 'stamped' })
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Unexpected error' }, 500)
  }
})
