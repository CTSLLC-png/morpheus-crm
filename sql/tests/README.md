# Morpheus OS — database test suite

pgTAP suites that assert the business-rule invariants and the multi-tenant
RLS boundaries of the Morpheus OS database.

| File | Asserts | Tests |
|---|---|---|
| `0001_invariants.test.sql` | trigger-enforced business rules in `empowercare` and `melrah` | 58 (51 pass, 7 known-failing) |
| `0002_tenant_isolation.test.sql` | RLS / tenant isolation under an impersonated `authenticated` JWT | 51 (46 pass, 5 known-failing) |

Both files are **read-only against the live database**. Each one is wrapped in
`BEGIN ... ROLLBACK`, including `CREATE EXTENSION IF NOT EXISTS pgtap`, so
running them leaves no extension, no fixture rows and no schema change behind.

---

## Read this first: unenforced invariants

Sixteen of the invariants under test are genuinely enforced. **Twelve
assertions currently fail**, because the database does not enforce what it is
supposed to. They are written as the invariant *should* hold and wrapped in
`todo_start()` / `todo_end()`, so:

* the suite still exits clean today (TAP counts a failing TODO as expected);
* the moment somebody fixes the underlying bug, pgTAP reports
  `# TODO ... unexpectedly succeeded`, which is the signal to delete the TODO
  wrapper and promote the test.

**Do not "fix" these by relaxing them into assertions of the current
behaviour.** They are the bug list.

### Isolation gaps (`0002`)

| Test | Finding |
|---|---|
| `Z1` | **The `melrah` tenant has zero rows in `core.membership`.** Every `melrah` RLS policy is `core.member_of(core.tenant_id('melrah'))`, so with no members the entire module is unreachable for every authenticated user — even though `core.tenant_module` enables three melrah modules. The tables are currently empty, so nothing is lost yet, but the module is dead on arrival. |
| `Z2` | **`melrah` RLS is tenant-*constant*, not row-scoped.** The policy qual never references the row's `tenant_id`, so a melrah member sees any row in a melrah table regardless of which tenant stamped it. Verified: a row inserted with the CTS tenant id is visible to a melrah member. |
| `Z3` | Same hole on the write side — `WITH CHECK` does not pin `tenant_id`, so a melrah member can insert a row belonging to another tenant. |
| `Z4`, `Z5` | **`empowercare` RLS is not tenant-scoped at all.** Every policy keys off `public.staff_profiles`, never `core.membership`, and no `empowercare` table carries a `tenant_id` column. A staff user stripped of every tenant membership still reads all enrollments and the whole audit log. Tenant isolation is structurally impossible in this schema as designed. |

Related design note (not a test failure): `core.tenant_id()` is `STABLE` but
**not** `SECURITY DEFINER`, so it reads `core.tenant` through RLS. For a
non-member it returns `NULL`, and `core.member_of(NULL)` is false. The result
is self-consistent but circular — `melrah.tid()`, which is the column default
for `tenant_id` on `account`, `lot` and `work_order`, silently yields `NULL`
for a non-member.

### Business-rule gaps (`0001`)

| Test | Finding |
|---|---|
| `Z1` | `trg_release_gate` is **`BEFORE UPDATE` only**. A lot `INSERT`ed directly with `status='RELEASED'` never consults `enforce_release_gate` — released with zero QC inspections and a `NULL` `released_at`. |
| `Z2` | `trg_wo_close` is **`BEFORE UPDATE` only**. A work order `INSERT`ed directly as `CLOSED` skips `enforce_wo_close` and leaves `closed_at` `NULL`, even with quarantined lots. |
| `Z3` | `trg_activation_gate` is **`BEFORE UPDATE` only**. An account `INSERT`ed directly as `ACTIVE` skips `enforce_activation_gate` — verified active with all 8 blocking onboarding steps still `OPEN`. |
| `Z4` | `set_retain_until` returns early when `retention_policy_id IS NULL`, so `retain_until` is fully client-writable on an enrollment with no policy attached. |
| `Z5` | **Highest consequence.** Because the trigger only acts when a policy is attached, an `UPDATE` that sets `retention_policy_id = NULL` *and* back-dates `retain_until` sticks. That makes the row eligible for `empowercare.purge_expired()`, which hard-`DELETE`s attempts, amendments, credentials and the enrollment under the `empowercare.purge` flag. A single `UPDATE` therefore arms irreversible destruction of assessment records. |
| `Z6` | `trg_enforce_gate` is **`BEFORE INSERT` only**. Insert an attempt against a permitted assessment, then `UPDATE` `assessment_key` to a gated one while the row is still `OPEN`, and submit it. Verified reaching `dx`/`SUBMITTED` while `gate_block()` still reports nine outstanding modules. |
| `Z7` | `enforce_gate_on_attempt` writes a `BLOCKED` row into `empowercare.audit` and then `RAISE`s in the same transaction, so the audit row is rolled back with the rejection. **Blocked attempts leave no trace in the audit log.** |

The common fix for `Z1`–`Z3`/`Z6` is to make the gate triggers
`BEFORE INSERT OR UPDATE` and re-evaluate on the relevant column changes; for
`Z7`, the audit write needs to escape the aborting transaction.

---

## What passes

### `0001_invariants.test.sql`

* **A1–A7 — `empowercare.attempt` immutability** (`lock_submitted_attempt`).
  An `OPEN` attempt is editable; once `SUBMITTED`, every `UPDATE` is refused,
  including a status walk-back and a no-op `SET id=id`. `DELETE` is refused
  outright, and permitted only while `empowercare.purge='on'` — the documented
  retention-purge path — then locked again when the flag is cleared.
* **B1–B5 — `empowercare.audit` append-only** (`audit_append_only`). `INSERT`
  works; `UPDATE`, targeted `DELETE` and unqualified `DELETE FROM audit` are
  all refused. Confirms `empowercare.purge='on'` does **not** unlock the audit
  log (unlike `attempt`).
* **C1–C12 — assessment gates** (`gate_block` / `enforce_gate_on_attempt`).
  Day-10 blocked while earlier modules are outstanding (and the message
  enumerates them); `WEEK_TWO_BLOCKED` blocks day ≥ 6 but still permits day 5;
  `COHORT_EXIT` blocks everything; unknown assessment key and unknown
  enrollment are both rejected by the gate rather than by a constraint. Days
  8/9 are gated on `regulatory_ref` freshness — the suite forces the register
  both current and stale so the result is deterministic rather than dependent
  on today's data.
* **D1–D4 — `retain_until` derivation** (`set_retain_until`). Derived from
  `enrolled_at + retain_years`; recomputed from `completed_at` once set; a
  hand-set value is overwritten on both `INSERT` and `UPDATE` — *while a
  retention policy is attached*. See `Z4`/`Z5` for the case where it is not.
* **E1–E7 — `melrah.lot` release gate** (`enforce_release_gate`). Refused with
  no QC, refused when the latest disposition is `REJECT`, refused with an open
  `CRITICAL` nonconformance. Permitted on a passing QC, with a closed critical
  NCR and an open minor NCR. E3 specifically proves the documented
  "highest `seq` wins" rule by giving the losing `REJECT` a *later*
  `inspected_at` than the winning `ACCEPT`.
* **F1–F7 — append-only ledgers** (`custody_append_only`, `qc_append_only`).
  `UPDATE` and `DELETE` refused on both `custody_event` and `qc_inspection`;
  `INSERT` permitted; `melrah.purge='on'` unlocks `DELETE` but never `UPDATE`.
* **G1–G4 — work-order close gate** (`enforce_wo_close`). Refused with a
  `QUARANTINE` or `IN_PROCESS` lot; permitted once every lot is `RELEASED`
  through the proper QC path, and `closed_at` is stamped.
* **H1–H5 — activation gate** (`enforce_activation_gate`). One task seeded per
  onboarding step; activation refused while blocking steps are open — including
  when exactly one remains; permitted when every blocking step is `DONE` or
  `WAIVED`, and H5 proves a non-blocking step was still `OPEN` so H4 is not
  vacuous.

### `0002_tenant_isolation.test.sql`

Every isolation assertion runs as the `authenticated` role under an
impersonated JWT and asserts **both directions** — a member sees its rows, a
non-member sees exactly zero.

```sql
SELECT set_config('request.jwt.claims',
       json_build_object('sub','<uuid>','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
```

* **T1–T5 — preconditions.** Proves the suite really dropped privileges:
  `current_user = 'authenticated'`, the role does **not** have `BYPASSRLS`, and
  it is not `service_role`. `service_role` and `postgres` bypass RLS entirely,
  so any isolation result obtained as either is meaningless — if T1–T3 fail,
  ignore everything after them. T5 asserts RLS is enabled on all 28 tables in
  `core`, `empowercare` and `melrah`.
* **C1–C11 — kernel, as a CTS owner.** Sees the `cts` tenant, cannot see
  `parentplug`; sees only its own `core.membership` rows; `tenant_module` is
  membership-scoped. `public.morpheus_bootstrap()` is `SECURITY INVOKER`, so
  C9–C11 confirm it inherits RLS and does not leak a foreign tenant.
* **N1–N8 — outsider.** `384f0300-…` is a real `auth.users` row with no
  membership and no staff profile: zero tenants, zero memberships, zero
  `tenant_module`, empty bootstrap, `member_of()` and `has_role()` false. N7/N8
  repeat it for a forged JWT `sub` that is not an auth user at all.
* **M1–M15 — melrah.** Positive direction requires a member, and the tenant has
  none, so the fixture grants `d3d768f6-…` a transaction-local `OPERATOR`
  membership. That user then sees the account, work order, lot, QC inspection
  and custody event, and may insert. `653eeb1f-…` — a CTS owner and staff, but
  not a melrah member — sees **zero** of each and is refused `INSERT` with
  `42501`.
* **E1–E7 — empowercare.** Staff see enrollments. A participant bound to a
  non-staff auth user sees their own enrollment and **not** another
  participant's, and sees zero `attempt` and zero `audit` rows.

---

## Running the suite

### psql

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 0001_invariants.test.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 0002_tenant_isolation.test.sql
```

Connect as a role that owns the tables (e.g. `postgres`). The invariant suite
needs owner rights to seed fixtures; the isolation suite seeds as owner and
then drops to `authenticated` itself. **Never run either file as
`service_role`** — it bypasses RLS and `0002` would report false passes (T1–T3
exist to catch exactly that).

For pretty TAP output:

```bash
psql "$DATABASE_URL" -Atq -f 0001_invariants.test.sql | pg_prove -
# or, without pg_prove:
psql "$DATABASE_URL" -Atq -f 0001_invariants.test.sql
```

### Supabase SQL editor

Paste the contents of one file into the SQL editor and run it. Each `SELECT`
returns one TAP line; scan for rows beginning `not ok`. Lines ending
`# TODO ...` are the known-failing tests documented above and are expected.

Caveats:

* Run **one file at a time** — each is a self-contained transaction.
* Do not remove the trailing `ROLLBACK;`. Without it the fixtures, the
  temporary `core.membership` grants and the `pgtap` extension would be
  committed to the live database.
* The editor connects as a superuser-equivalent role, which is correct for
  seeding; the file drops to `authenticated` where it matters.

### Notes on determinism

* `0001` rewrites `empowercare.regulatory_ref.review_by` inside the transaction
  so the day-8/9 gate tests do not depend on how stale the live register
  happens to be today. It restores the register before section D. All of it is
  rolled back.
* Fixtures use fixed UUID prefixes so a failure is traceable: `e…` for
  empowercare and `a…` for melrah in `0001`, `b…` throughout `0002`.
* `0002` grants a transaction-local melrah membership because the positive
  direction is otherwise untestable (finding `Z1`). Test `Z1` deliberately
  excludes that grant so it measures the real state of the table.
