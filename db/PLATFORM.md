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
