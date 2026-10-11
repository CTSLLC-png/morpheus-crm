# Healthcare credentialing: verified database relationships (2026-10-11)

Read-only inspection of active Supabase project `ymavrmekxiwdphdyteau`:

- `melrah.account.tenant_id` has FK to `core.tenant.id`.
- `melrah.facility.account_id` has FK to `melrah.account.id`.
- `melrah.field_resource` has `id`, `user_id`, and role data, **but no direct tenant_id and no foreign-key constraint**.
- `core.membership.role` has actual value `OWNER` (uppercase), not `owner` or `admin`. The initial proposal would deny access to the real owner.
- No credentialing tables were created in the live project.

## Required before deployment

1. Decide how technicians belong to a tenant: create an explicit `melrah.healthcare_technician_tenant` relation or add a controlled `tenant_id` to `field_resource`, with unique composite keys and trusted administrative assignment. Do not infer tenant ownership from the technician's name or an unverified UI field.
2. Enforce matching tenant on each clearance's facility and technician at the database boundary (composite foreign keys or validated trigger); RLS alone is insufficient to stop privileged ingestion errors.
3. Verify provider key against the facility's primary provider and ensure a verifier with audited permissions signs off.
4. Test owner-only RLS and cross-tenant denial with distinct authenticated test users in isolated staging.
5. Verify server-side dispatch checks before any live healthcare assignments.

The corrected `OWNER` check in the accompanying SQL is **not** an approval to execute the schema. All deployment gates remain open.
