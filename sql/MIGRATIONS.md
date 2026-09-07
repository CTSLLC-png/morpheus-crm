# Morpheus OS — migrations

SQL in this directory is **not applied automatically**. Every file is written
to be read by a human, reviewed, and then run by hand against the live
project (`ymavrmekxiwdphdyteau`) — which serves morpheuscr.com in production.

Migrations applied before this directory existed live in
`supabase_migrations.schema_migrations` with timestamp versions. The numbered
files here are the reviewable ones, and they are **not** recorded in that
table by applying them; note the date and version you applied by hand.

## How to apply

1. Read the whole file first, including the header comment. Each one explains
   what it does and why, and several call out consequences that are easy to
   miss.
2. Run it in the Supabase SQL editor **as the table owner** (`postgres` /
   service role). Several tables have RLS enabled without `FORCE`, so the
   owner is what makes the seeds and policy changes possible.
3. Run the `VERIFICATION` block at the bottom of the file (commented out) and
   check the results match what the comment says to expect.
4. Every file is wrapped in a single `BEGIN … COMMIT` and is idempotent —
   re-running one is a no-op, not a duplicate.

## Order

Apply in ascending number. `0007` depends on `0006` only in the loose sense
that both touch cohorts; the hard dependencies are:

| File | Hard dependency |
|---|---|
| `0003_melrah_seed.sql` | the `melrah` tenant row (already present) |
| `0004_product_family.sql` | `core.module`, `core.tenant` |
| `0005_clearcall_cer_course.sql` | `public.edu_courses`, `public.edu_modules` |
| `0006_cohort_invite_codes.sql` | `public.cohorts`, `public.participants`, `public.cohort_enrollments`, `public.staff_profiles` |
| `0007_vendor_access.sql` | `public.cohorts`, `public.cohort_enrollments`, `empowercare.enrollment`, `empowercare.attendance` |
| `0008_engagement_tracking.sql` | **`core.module` — and `0004` should be applied first** so the FK on `module_key` resolves against the same catalogue the app groups by |

`0004` also carries an application dependency in the other direction:
`src/lib/morpheus.js` selects `core.module.family` on the direct-kernel path.
Until `0004` is applied that select errors and the client falls through to the
`morpheus_bootstrap()` bridge, which still works. The sidebar renders either
way — see `src/modules/registry.jsx`, `familyOf()`.

---

## 0003 — `0003_melrah_seed.sql`

Melrah demo/reference data. Data-only. Self-documenting, with its own purge
block at the bottom of the file (commented out).

**Rollback:** uncomment and run the purge block in section 14 of that file.

---

## 0004 — `0004_product_family.sql`

**What it does.** Adds the brand-grouping concept so CER + EmpowerCare present
as *ClearCall* while Claude Academy does not.

* creates `core.product_family` (key, name, description, sort_order) with RLS
  and a read-for-authenticated policy mirroring `core.module`'s
* adds nullable `core.module.family`, FK to that table
* seeds one family, `clearcall`, and sets `family = 'clearcall'` on
  `workforce.cer` and `workforce.empowercare`
* `CREATE OR REPLACE`s `public.core_module` to append a `family` column, and
  adds `public.core_product_family` — both `security_invoker = true`
* `CREATE OR REPLACE`s `public.morpheus_bootstrap()` and
  `public.morpheus_participant_bootstrap()` to emit `family`

**Why a column and a lookup table, not a new tenant.** ClearCall is a brand,
not an organisation. A `clearcall` tenant would fork `core.membership`, force
every participant, cohort, call session and EmpowerCare enrollment to pick a
side, and break `empowercare.is_staff()`, which hardcodes
`core.tenant_id('cts')`. The grouping is presentational, so it is modelled as
a label. Entitlement stays exactly where it was: one `core.tenant_module` row
per module. There is deliberately no way to "enable ClearCall" as a unit.

**Rollback.**

```sql
BEGIN;
-- the app tolerates family being absent, but drop the dependent views first
DROP VIEW IF EXISTS public.core_product_family;
DROP VIEW public.core_module;
CREATE VIEW public.core_module WITH (security_invoker = true) AS
  SELECT key, name, description, schema_name, category, status, sort_order
    FROM core.module;
GRANT SELECT ON public.core_module TO authenticated;

ALTER TABLE core.module DROP CONSTRAINT IF EXISTS module_family_fkey;
ALTER TABLE core.module DROP COLUMN IF EXISTS family;
DROP TABLE IF EXISTS core.product_family;
COMMIT;
```

Then restore the two RPCs to their pre-0004 bodies:

```sql
CREATE OR REPLACE FUNCTION public.morpheus_bootstrap()
 RETURNS jsonb LANGUAGE sql STABLE
 SET search_path TO 'public', 'core', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'tenants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'slug', t.slug, 'name', t.name,
        'legal_entity', t.legal_entity, 'industry', t.industry,
        'status', t.status, 'role', m.role,
        'modules', coalesce((
          select jsonb_agg(jsonb_build_object(
            'key', mo.key, 'name', mo.name, 'description', mo.description,
            'schema', mo.schema_name, 'category', mo.category,
            'status', mo.status, 'sort_order', mo.sort_order,
            'enabled', tm.enabled, 'config', tm.config
          ) order by mo.sort_order)
          from core.tenant_module tm
          join core.module mo on mo.key = tm.module_key
          where tm.tenant_id = t.id
        ), '[]'::jsonb)
      ) order by t.name)
      from core.tenant t
      join core.membership m on m.tenant_id = t.id and m.user_id = auth.uid()
    ), '[]'::jsonb)
  )
$function$;

CREATE OR REPLACE FUNCTION public.morpheus_participant_bootstrap()
 RETURNS jsonb LANGUAGE sql STABLE
 SET search_path TO 'public', 'core', 'pg_temp'
AS $function$
  with me as (select public.current_participant_id() as pid),
  assigned as (
    select pm.module_key from public.participant_modules pm, me
     where pm.participant_id = me.pid and pm.enabled
  )
  select jsonb_build_object(
    'participant_id', (select pid from me),
    'assignment_mode', case when exists (select 1 from assigned) then 'assigned' else 'all' end,
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', m.key, 'name', m.name, 'description', m.description,
        'category', m.category, 'sort_order', m.sort_order
      ) order by m.sort_order)
      from core.module m
      where m.status = 'AVAILABLE'
        and (exists (select 1 from assigned a where a.module_key = m.key)
             or not exists (select 1 from assigned))
    ), '[]'::jsonb)
  )
$function$;
```

If you only want to *undo the grouping* without dropping anything, that is a
one-liner and is the reversal to reach for first:

```sql
UPDATE core.module SET family = NULL WHERE family = 'clearcall';
```

(Note: `src/modules/registry.jsx` carries a pre-migration default, so the
sidebar will keep grouping CER + EmpowerCare until the `family:` lines are
removed there too. That asymmetry is deliberate and documented in the file.)

---

## 0005 — `0005_clearcall_cer_course.sql`

**What it does.** Seeds the ClearCall CER **course shell** into the existing
LMS engine: one `public.edu_courses` row (`CLEARCALL-CSR`, 80 hours,
credential name *ClearCall Call Center Customer Service Certification*,
credential prefix `CTS`, issuer `CTS LLC`, `is_published = FALSE`) and its
four `public.edu_modules` rows, in the order the company one-pager gives them:

1. Communication Fundamentals
2. Customer Service Excellence
3. Tools & Compliance
4. Job Readiness & Mock Calls

**What it deliberately does not do.** No lessons. No checkpoint questions. No
per-module durations. No subtitles or summaries. That content has not been
written, and inventing it would put fabricated curriculum behind a credential
issued to justice-involved participants. Every module is `status = 'outline'`
and the course stays unpublished, so participants cannot see it (the
`edu_courses` RLS policy filters on `is_published`) until a human publishes it.

It also creates no link between this course and `core.module 'workforce.cer'`
— `edu_courses` has no such column, and the existing CAP-C course has no link
either — and no simulator wiring for module 4.

**Rollback.**

```sql
BEGIN;
DELETE FROM public.edu_modules m
 USING public.edu_courses c
 WHERE m.course_id = c.id AND c.code = 'CLEARCALL-CSR';
DELETE FROM public.edu_courses WHERE code = 'CLEARCALL-CSR';
COMMIT;
```

Safe only while the course has no lessons, no progress and no credentials.
Once real content or a single `edu_credentials` row exists, **do not delete
it** — set `is_published = FALSE` instead.

---

## 0006 — `0006_cohort_invite_codes.sql`

**What it does.** Adds cohort invite / enrolment codes so participant
self-registration binds to a cohort.

* `public.cohort_invite_code` — unique `code`, optional `expires_at`,
  optional `max_uses`, `uses` counter, `revoked_at` for revocation
* `public.cohort_invite_redemption` — append-only audit of who redeemed what
* RLS: **staff only** on the code table. No participant, vendor or anon
  SELECT policy exists — a code is a bearer secret. Participants may read
  their own redemption row, which carries no code value.
* `public.redeem_cohort_invite(p_code text, p_full_name text DEFAULT NULL)` —
  `SECURITY DEFINER`, `EXECUTE` granted to `authenticated` only. Locks the
  code row `FOR UPDATE`, validates it, creates the caller's `participants` row
  on first redemption (the `trg_generate_cts_id` trigger assigns the CTS-XXXXX
  id), inserts the `cohort_enrollments` row, records the redemption and
  increments `uses`. Re-redeeming the same code is idempotent and does not
  burn a second use.

**Security note.** Every failure mode — unknown code, revoked, expired, used
up — raises the *same* message, so the function cannot be used as an oracle to
enumerate codes. It requires `auth.uid()`, so anonymous probing is impossible.

**Known gap, not solved here:** an authenticated attacker can still call the
function in a loop to brute-force codes. Mitigate operationally — long random
codes (the shape check enforces 8–32 chars of `[A-Z0-9-]`), short expiry, low
`max_uses` — and with rate limiting at the API gateway. A lockout table was
considered and rejected as scope creep for a schema migration.

**Rollback.**

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.redeem_cohort_invite(text, text);
DROP TABLE IF EXISTS public.cohort_invite_redemption;
DROP TABLE IF EXISTS public.cohort_invite_code;
COMMIT;
```

Dropping these does **not** remove participants or cohort enrolments created
through them — those are ordinary rows in `participants` and
`cohort_enrollments` and survive, which is the intent. Only the audit trail of
*how* they enrolled is lost, so export
`public.cohort_invite_redemption` first if that matters.

---

## 0007 — `0007_vendor_access.sql`

**What it does.** Adds view-only vendor/funder accounts scoped by cohort.

* `public.vendor` (slug, name, kind, status), `public.vendor_user`
  (which auth users act for a vendor), `public.vendor_cohort` (the scope
  grant, revocable via `revoked_at`)
* helpers, all `SECURITY DEFINER`: `current_vendor_id()`, `is_vendor()`,
  `vendor_cohort_ids()`, `vendor_sees_participant(uuid)`,
  `vendor_sees_ec_enrollment(uuid)`
* **PERMISSIVE, SELECT-only** vendor policies on `public.cohorts`,
  `public.cohort_enrollments`, `public.edu_progress`,
  `public.edu_credentials` and `empowercare.attendance`
* column-minimised read API: `public.vendor_roster()` and
  `public.vendor_empowercare_status()`

**The role.** `'vendor'` becomes a fourth value in
`auth.users.raw_app_meta_data->>'role'`, which `public.current_user_role()`
reads. It is a **UI hint only** — every policy keys off `current_vendor_id()`,
which requires an explicit `vendor_user` row joined to an `ACTIVE` vendor. Two
independent facts must agree, and the database only trusts the one it owns.
Setting `status = 'SUSPENDED'` or `revoked_at` on the grant cuts access on the
next request; both are verified below.

> **Pre-existing bug you will hit when creating the first vendor user.**
> `supabase/functions/on-user-signup/index.ts` writes the role to
> **`user_metadata`**, but `current_user_role()` reads **`raw_app_meta_data`**
> (changed by the `harden_current_user_role_to_app_metadata` migration on
> 2026-08-27). The hook has not been updated and its `ALLOWED_ROLES` list does
> not include `vendor`. This branch does not touch it. Until it is fixed, set
> vendor (and any) roles with
> `auth.admin.updateUserById(id, { app_metadata: { role: 'vendor' } })`.

**Data minimisation.** A vendor may see participant name and status, progress,
completion, and EmpowerCare **attendance and completion status only** — never
assessment scores, attempts or gate results. No vendor policy is created on
any of: `empowercare.attempt`, `amendment`, `remediation`, `exam_form`,
`audit`, `assessment`, `artifact`, `artifact_exercise`, `enrollment`,
`credential`, `public.edu_checkpoint_attempts`, `edu_checkpoint_questions`,
`call_sessions`, `call_scores`, `certifications`, `score_matrix_weights`.

`empowercare.enrollment` is on that list for a non-obvious reason: its `state`
enum includes `WEEK_TWO_BLOCKED`, which **is** the result of the hard day-3
*Caller authentication* gate. Handing a vendor the raw state would tell them a
participant failed a specific compliance gate. `vendor_empowercare_status()`
maps it down to `IN_PROGRESS` / `COMPLETED` / `EXITED` before it leaves the
database.

**Why some access is a function, not a policy.** RLS filters rows, not
columns. `public.participants` carries `dob`, `ldss_office`,
`ldss_case_number`, `ldss_caseworker` and `notes`; a row-level vendor policy
would expose a participant's benefits case number to any vendor querying the
table directly through PostgREST, whatever the UI chose to render. Column-level
`GRANT`s cannot help, because PostgREST runs every authenticated request as the
single `authenticated` role. So for `participants`, `empowercare.enrollment`
and `empowercare.credential` the vendor path is a `SECURITY DEFINER` function
with an explicit column list, and **no vendor policy exists on those base
tables**. No `SECURITY DEFINER` *view* is created anywhere — every view in this
database is `security_invoker = true` (the 2026-08-27
`views_security_invoker_rls_enforcement` incident found 23 that were not).

**Not granted, on the conservative side, and worth a decision later:**
`public.certifications` (it carries `qualifying_avg`, a score) and
`public.cts_id` on the roster. CER completion reaches vendors through
`edu_credentials` and the roster function instead.

**Rollback.**

Order matters: the policies must go before the functions they call, and the
three new tables carry policies of their own that also depend on
`current_vendor_id()` — so drop the tables before the functions, not after.

```sql
BEGIN;
-- 1. vendor policies on pre-existing tables
DROP POLICY IF EXISTS attendance_vendor_read         ON empowercare.attendance;
DROP POLICY IF EXISTS edu_credentials_vendor_read    ON public.edu_credentials;
DROP POLICY IF EXISTS edu_progress_vendor_read       ON public.edu_progress;
DROP POLICY IF EXISTS cohort_enrollments_vendor_read ON public.cohort_enrollments;
DROP POLICY IF EXISTS cohorts_vendor_read            ON public.cohorts;

-- 2. the new tables (this takes their own policies with them)
DROP TABLE IF EXISTS public.vendor_cohort;
DROP TABLE IF EXISTS public.vendor_user;
DROP TABLE IF EXISTS public.vendor;

-- 3. only now are the functions unreferenced
DROP FUNCTION IF EXISTS public.vendor_empowercare_status();
DROP FUNCTION IF EXISTS public.vendor_roster();
DROP FUNCTION IF EXISTS public.vendor_sees_ec_enrollment(uuid);
DROP FUNCTION IF EXISTS public.vendor_sees_participant(uuid);
DROP FUNCTION IF EXISTS public.vendor_cohort_ids();
DROP FUNCTION IF EXISTS public.is_vendor();
DROP FUNCTION IF EXISTS public.current_vendor_id();
COMMIT;
```

To revoke one vendor without rolling back, prefer
`UPDATE public.vendor SET status = 'SUSPENDED' WHERE slug = '…';` — instant,
reversible, and it leaves the grant history intact.

---

## 0008 — `0008_engagement_tracking.sql`

**What it does.** Adds auto-tracked engagement telemetry, kept structurally
separate from attested attendance.

* `public.engagement_login_event` — sign-in / sign-out / session ping
* `public.engagement_module_time` — one row per segment a participant had a
  module open; `seconds` capped at 43200 (12h) so one stuck browser tab cannot
  dominate a total; `module_key` FK'd to `core.module`
* `public.v_engagement_hours` — rollup, `security_invoker = true`
* RLS: participants insert and read their own, staff read all. **No UPDATE and
  no DELETE policy for anyone** — telemetry is append-only, so a total cannot
  be quietly edited after it has been reported.

**The rule this migration exists to protect.** Everything here is
**informational**. It is client-reported machine telemetry and is **not**
contact hours, **not** attendance, and **not** caseworker-verifiable. Each
table carries that statement as a `COMMENT ON TABLE`, so it travels with the
schema into any dump, diagram or generated type. The caseworker-verifiable
record is and remains `empowercare.attendance` — staff-attested, one row per
enrollment per day, capped at 12 contact hours, with `recorded_by` naming the
attester. Nothing in this migration writes to it, aggregates into it, or joins
to it.

Consequently there is **no vendor policy** on either table: a funder asking
"how many hours did they do" must be answered from attested attendance, never
from telemetry. The rollup column is named `engagement_hours`, not `hours` and
not `contact_hours`, for the same reason.

Note that this migration adds schema only. Nothing writes to these tables yet;
the client-side capture is not implemented on this branch.

**Rollback.**

```sql
BEGIN;
DROP VIEW  IF EXISTS public.v_engagement_hours;
DROP TABLE IF EXISTS public.engagement_module_time;
DROP TABLE IF EXISTS public.engagement_login_event;
COMMIT;
```

Destroys the collected telemetry. Since it is explicitly informational and
never the system of record for anything, that is acceptable — but export first
if any reporting has started to reference it.

---

## How these were verified

`0004`–`0008` were applied and exercised against a **local, throwaway
PostgreSQL 16 instance** seeded with a minimal stand-in for the production
schema. Nothing was run against `ymavrmekxiwdphdyteau`; the live database was
read with `SELECT` only. Checks that passed:

* all five apply cleanly, and re-applying all five is a no-op (idempotent)
* `family` lands on `workforce.cer` and `workforce.empowercare` only;
  `workforce.academy` stays `NULL`
* `CLEARCALL-CSR` has exactly 4 modules, **0 lessons**, `is_published = false`
* `redeem_cohort_invite`: happy path creates the participant and CTS id;
  re-redeeming does not burn a second use; `max_uses` is enforced; revoked,
  expired and unknown codes all raise the identical message; a refused
  redemption leaves **no** orphan participant row; a participant session reads
  **0** rows from `cohort_invite_code`
* a vendor sees only granted cohorts; reads **0** rows from
  `public.participants` and **0** from `empowercare.attempt`; sees only the
  granted cohort's attendance; and every write (insert/update/delete on
  cohorts, enrolments, own grants) is rejected
* `WEEK_TWO_BLOCKED` surfaces as `IN_PROGRESS` through
  `vendor_empowercare_status()`
* revoking the grant, and suspending the vendor, each cut access immediately
* staff visibility is unchanged after every migration
* a participant cannot write engagement telemetry for another participant; a
  vendor reads **0** engagement rows; the 12h cap, the start/end window check
  and the `module_key` FK all reject bad data
* no view in `public`, `core` or `empowercare` is missing
  `security_invoker=true`; all eight new tables have RLS enabled; no vendor
  policy exists on any forbidden table
