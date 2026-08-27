# MorpheusOS platform architecture (as built)

Discovered by inspecting the live Supabase project, not from any repo file.
Nothing in `src/` currently consumes any of it.

## The database is a multi-tenant, multi-product platform

Four schemas, not one app:

| Schema | Purpose |
|---|---|
| `core` | Tenant + module registry. The platform spine. |
| `public` | Morpheus CRM (CER call training) + MORPHEUS.EDU (`edu_*`) |
| `empowercare` | EmpowerCare compliance training (17 tables) |
| `melrah` | Melrah Environmental reverse logistics / ITAD (11 tables) |

### `core` — the spine

- `core.tenant` — CTS, Melrah Environmental Technologies, ParentPlug
- `core.module` — the service catalogue, with `schema_name`, `category`, `status`, `sort_order`
- `core.tenant_module` — which tenant has which module enabled (`config jsonb`)
- `core.membership` — `user_id`, `tenant_id`, `role`

### Registered modules

| key | name | schema | status | sort |
|---|---|---|---|---|
| `workforce.cer` | CER Certification | `public` | AVAILABLE | 10 |
| `workforce.empowercare` | EmpowerCare | `empowercare` | AVAILABLE | 20 |
| `logistics.accounts` | Provider Networks | `melrah` | AVAILABLE | 30 |
| `logistics.workorders` | Work Orders | `melrah` | AVAILABLE | 40 |
| `quality.inventory` | Inventory & QC | `melrah` | AVAILABLE | 50 |
| `nonprofit.parentplug` | ParentPlug Programs | — | PLANNED | 60 |

`core.module.sort_order` exists precisely to drive an ordered service
switcher. **This registry is the "missing dropdown."** The data is live;
the frontend has never read it.

### API surface

PostgREST only exposes `public`, so all three non-public schemas are
already fronted by 30 passthrough views: `core_*` (4), `ec_*` (14),
`ml_*` (12). The frontend reaches every module through these without
any further database work.

## Consequences for application code

1. **Do not build a second tenancy model.** `core.tenant` +
   `core.membership` are the tenant and role source. A `programs` or
   `organizations` table alongside them would fracture the platform.
   (`src/modules/cx/schema.sql` defines `organizations` / `org_members`
   and predates this discovery — it has never been applied to
   production and must be reconciled onto `core` before it is.)
2. **Access scoping derives from `core.membership` + `core.tenant_module`.**
   A user sees the modules enabled for the tenants they belong to.
3. **Claude Academy is not registered.** The `edu_*` course `CAP-C`
   exists and has a working UI, but there is no `core.module` row for
   it, so it cannot appear in a registry-driven switcher. It needs one
   (suggested key: `workforce.academy`, schema `public`).
4. **EmpowerCare has no scoring matrix table of the kind assumed
   elsewhere.** It models assessment/attempt/exam_form/remediation plus
   attendance, audit, regulatory_ref and retention_policy — a
   compliance-grade design. Any scoring work must build on those.

## Security posture of the passthrough views (verified)

All 30 `core_*` / `ec_*` / `ml_*` views hold broad table grants —
`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` — to
both `anon` and `authenticated`. Those grants alone are alarming, but
they are **not** exploitable as configured:

- Every view is `security_invoker = true`, so the caller's privileges
  and the base table's RLS apply rather than the view owner's.
- RLS is enabled on all `core`, `empowercare`, and `melrah` base tables
  (32 policies: 4 / 17 / 11).
- **Every policy targets the `authenticated` role. Not one targets
  `anon`.** RLS-enabled with no applicable policy denies by default, so
  the public anon key reads and writes nothing here.

Representative policies:

| Table | Policy | Cmd | Predicate |
|---|---|---|---|
| `core.membership` | `my_membership` | SELECT | `user_id = auth.uid()` |
| `core.tenant` | `my_tenants` | SELECT | `core.member_of(id)` |
| `core.module` | `read_modules` | SELECT | `true` (catalogue is public to signed-in users) |
| `core.tenant_module` | `my_tenant_modules` | SELECT | `core.member_of(tenant_id)` |
| `empowercare.credential` | `own_credential` / `staff_all` | SELECT / ALL | own participant row / `empowercare.is_staff()` |
| `melrah.custody_event` | `melrah_members` | ALL | via `work_order` → `core.member_of(tenant_id)` |

`core` exposes **no write policy at all**, so the registry is read-only
to every client; it can only be changed by the service role.

### Hardening worth doing (not urgent, not a live exposure)

The `INSERT/UPDATE/DELETE/TRUNCATE` grants to `anon` and `authenticated`
serve no purpose and are a latent hazard: they become immediately
exploitable if RLS is ever disabled on a base table, or if a permissive
policy is later added for `anon`. Revoke write privileges on all 30
passthrough views and leave `SELECT` only. Note the repo ships a
hardcoded anon key in `src/lib/supabase.js` and the repository is
public, so the anon key must be treated as known to the world.

## Melrah Environmental — scope (confirmed by the owner)

Melrah is **logistics operations and work-order dispatch** for a medical
device reprocessing programme: collecting used devices from participating
healthcare facilities, reprocessing them, running QC, releasing them back.

**Melrah has no scoring matrix, by design.** The environmental collection
course has not been built yet. Do not add one, and do not read
`melrah.qc_inspection` as a training rubric — it is AQL-style acceptance
sampling (`sample_size`, `defects_found`, `disposition`), which is a
manufacturing QC concept, not an assessment.

Operational spine:

| Entity | Role |
|---|---|
| `account` → `facility` | Participating provider networks and their sites |
| `work_order` | The dispatch unit — `COLLECTION` / `AUDIT` / `SWAP` |
| `work_order_line` | Expected vs received quantity per device SKU |
| `custody_event` | Chain of custody — the operational activity timeline |
| `lot` / `lot_status` | Reprocessing batches, with cycle number against `device.max_cycles` |
| `qc_inspection` | Sampling inspection and disposition per lot |
| `nonconformance` | NCRs with severity, CAPA reference, open/closed |

Work-order status flow observed in the seed data:
`DRAFT → IN_TRANSIT → RECEIVED → RELEASED → CLOSED`, plus `CANCELLED`.

All seeded rows are prefixed `DEMO —` and are pilot/demo data, not live
operations. Any UI over this must say so.
