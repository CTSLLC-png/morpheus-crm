# Edge functions — deploy runbook

Nothing in this directory was deployed by the session that wrote it. These are
the exact steps a human must run, in this order.

Project ref: `ymavrmekxiwdphdyteau` (morpheus-crm, ca-central-1) — **live
production, serving morpheuscr.com.**

---

## Read this first: there is a live privilege-escalation bug

The **currently deployed** `create-morpheus-user` and `create-participant-user`
authorize their caller like this:

```ts
const callerRole = (callerData.user.user_metadata?.role ?? "") as string;
if (callerRole !== "super_admin") { /* reject */ }
```

`user_metadata` is writable by the account holder with nothing but the anon key:

```js
await supabase.auth.updateUser({ data: { role: 'super_admin' } })
```

So **any signed-in user of morpheuscr.com can promote themselves in their own
metadata and then call these endpoints.** For `create-morpheus-user` that means
minting an account with a role and password of their choosing.

Today the damage is capped by the very bug this branch fixes: the created
account's `app_metadata` stays empty, so `public.current_user_role()` returns
NULL for it and RLS refuses it anyway. The two bugs partially cancel.

**That is why the deploy order below is not negotiable.** Fixing the metadata
split without fixing the caller check would uncancel them and turn a latent
hole into a live one.

There are 4 accounts on the project (3 trainer, 1 super_admin) and no
participant logins at all, so the exposure window has been narrow. It is still
a live hole in a production system and should be closed promptly.

---

## Order

### 1. Deploy the two account-creation functions — do these together

```bash
supabase link --project-ref ymavrmekxiwdphdyteau

supabase functions deploy create-morpheus-user
supabase functions deploy create-participant-user
```

Keep `verify_jwt` **on** for both (the default). They require a signed-in staff
caller.

Both now read the caller's role from `app_metadata` via
`_shared/roles.ts → requireCaller()`, which closes the escalation above, and
both write the new account's role to `app_metadata` as well as `user_metadata`.

`create-participant-user` was deployed but **absent from the repository** — as
was `create-morpheus-user`. The files here are the deployed sources, corrected.
Diff them against the platform before you push if you want to be certain
nothing drifted since 2026-09-07.

**Verify** — as a super_admin, Admin panel → Create account → create one
trainer, then Admin panel → **Account roles**. The new row must show
`Enforced: trainer`. If Enforced is `none`, the stamp failed; do not proceed.

**Rollback** — `supabase functions deploy <name>` from the previous commit.
Both functions keep their old request and response shapes, so no client change
is needed to roll back.

---

### 2. Apply `sql/0009_role_metadata.sql`

Review it first — it adds triggers that write `auth.users`. It is written so
that a privilege failure is a logged warning and never a failed INSERT, but
read that for yourself rather than taking this file's word for it.

After applying, verify with Admin panel → **Account roles**, which is backed by
`public.staff_user_role_health()` from that migration.

This step is what makes participant self-registration and vendor accounts get a
role **without** step 3. Step 3 is belt and braces.

---

### 3. Deploy and wire `on-user-signup` — optional, and only after 1 and 2

```bash
supabase functions deploy on-user-signup --no-verify-jwt
```

`--no-verify-jwt` is required: a database webhook posts with the service key,
not a user JWT.

Then, in the dashboard:

> Database → Webhooks → Create a new hook
> * Table: `auth.users`
> * Events: `INSERT`
> * Type: Supabase Edge Functions → `on-user-signup`
> * HTTP headers: `Authorization: Bearer <SERVICE_ROLE_KEY>`

**This function is currently wired to nothing.** There is no non-internal
trigger on `auth.users` and no webhook invoking it — checked against production
on 2026-09-07. It has never run. Its previous header claimed it was registered
as an "After user is created" Auth Hook; no such HTTP hook exists in Supabase
Auth. If you deploy it without creating the webhook, nothing changes.

Note that a webhook fires **asynchronously**, after the user row commits and
after the client already holds a session, so there is a window where a new
account has no role. The client is built not to care — see
`src/lib/identity.js` — but it is why step 2 is the primary mechanism and this
is the fallback, not the other way round.

**Rollback** — delete the webhook. The function becomes inert again.

---

## What must NOT be deployed

Nothing else. In particular this branch does not touch `api/claude.js`,
`src/lib/ai.js`, `src/hooks/useCallSession.js`, `src/pages/CallSimulator.jsx`,
or any EmpowerCare gate logic in `empowercare.assessment`.

## After all three steps

`app_metadata.role` is the single source of truth, written by three
service-role paths (the two admin functions, the signup webhook) and
self-healed by the `0009` triggers. `user_metadata.role` continues to be
written as a **display mirror only**, so the Supabase dashboard's user list
stays legible — nothing reads it for an authorization decision, in the client,
in these functions, or in RLS.
