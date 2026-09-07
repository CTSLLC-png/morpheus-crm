// supabase/functions/_shared/roles.ts
// ── Morpheus CRM — the one place a role is written ──────────────
//
// ===================================================================
// APP_METADATA IS THE SOURCE OF TRUTH. USER_METADATA IS A MIRROR.
// ===================================================================
//
// auth.users.raw_app_meta_data  ← app_metadata
//   Writable ONLY by the service role. public.current_user_role() reads this,
//   and every role-based RLS policy in the database calls that function. This
//   is what "role" MEANS in Morpheus.
//
// auth.users.raw_user_meta_data ← user_metadata
//   Writable by the END USER with nothing but the anon key:
//       supabase.auth.updateUser({ data: { role: 'super_admin' } })
//   A role here is a claim by the user about themselves. It is worth nothing.
//
// Every account-creation path used to write ONLY user_metadata, and the React
// client used to read ONLY user_metadata. So the app and the database had two
// different, silently diverging ideas of who each user was. Accounts made by
// these functions had a role RLS could not see at all.
//
// The rule now, everywhere:
//
//   * These functions write the role to app_metadata. That is the grant.
//   * They ALSO copy it into user_metadata, for one reason only: an operator
//     reading the Supabase dashboard's user list sees user_metadata, and a
//     blank role column there would send them looking for a bug that is not
//     there. It is a label on the outside of the box.
//   * NOTHING reads the user_metadata copy for an authorization decision. Not
//     these functions (see requireCaller below, which reads app_metadata), not
//     the client (see src/lib/supabase.js), not RLS.
//
// If you are adding a new account-creation path, call stampRole() from it and
// do not hand-roll the metadata write.

import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2'

/**
 * Roles Morpheus understands.
 *
 * `vendor` is new: partner organisations (funders, referring agencies, host
 * facilities) get a read-only portal. Their actual data access comes from a
 * public.vendor_user row, not from this role — the role only decides which
 * shell they land in — but without it here they could not be created at all.
 */
export const ALLOWED_ROLES = ['super_admin', 'trainer', 'participant', 'vendor'] as const
export type Role = typeof ALLOWED_ROLES[number]

export const DEFAULT_ROLE: Role = 'participant'

/**
 * Coerce whatever arrived into a known role, or null.
 *
 * Returns null rather than defaulting, so callers must decide explicitly
 * whether "unrecognised" means "reject" or "treat as participant". Silently
 * turning `super_admin_pls` into `participant` is how a caller ends up
 * thinking it created an admin.
 */
export function normaliseRole(raw: unknown): Role | null {
  if (typeof raw !== 'string') return null
  const r = raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if ((ALLOWED_ROLES as readonly string[]).includes(r)) return r as Role
  if (r === 'admin' || r === 'superadmin') return 'super_admin'
  return null
}

/** A service-role client. Never hand this to anything that takes user input as a filter. */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * Write `role` to app_metadata (the grant) and mirror it into user_metadata
 * (the label). Existing metadata on both sides is preserved.
 *
 * Idempotent — safe to call on an account that already has the role, which is
 * what makes it usable as a repair as well as a create.
 */
export async function stampRole(
  admin: SupabaseClient,
  userId: string,
  role: Role,
  extraUserMetadata: Record<string, unknown> = {},
): Promise<void> {
  const { data: existing } = await admin.auth.admin.getUserById(userId)
  const priorApp  = existing?.user?.app_metadata  ?? {}
  const priorUser = existing?.user?.user_metadata ?? {}

  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata:  { ...priorApp,  role },
    user_metadata: { ...priorUser, ...extraUserMetadata, role },
  })
  if (error) throw error
}

/**
 * Authorize the caller of a function.
 *
 * Reads the caller's role from **app_metadata**. The previous versions of
 * these functions read `user_metadata.role` here, which meant any signed-in
 * participant could grant themselves `super_admin` in their own metadata with
 * the anon key and then call the account-creation endpoints. That was the
 * sharpest edge of the metadata split, and it is why this helper exists.
 *
 * @returns the caller's User on success, or a Response to return on failure.
 */
export async function requireCaller(
  admin: SupabaseClient,
  req: Request,
  allowed: readonly Role[],
): Promise<{ user: User } | { error: Response }> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: json({ error: 'Not authenticated' }, 401) }

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return { error: json({ error: 'Not authenticated' }, 401) }

  const callerRole = normaliseRole(data.user.app_metadata?.role)
  if (!callerRole || !allowed.includes(callerRole)) {
    return { error: json({ error: 'You do not have permission to do that' }, 403) }
  }
  return { user: data.user }
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
