# Healthcare MDR clearance contract: pre-Supabase reconciliation

**Status: design and acceptance criteria only. Do not enable production dispatch.**

## Confirmed model boundaries

The current live `melrah.work_order` shape has `tenant_id`, `account_id`, `facility_id`, `scheduled_for`, `assigned_resource_id`, and `program_key`. It does **not** have `client_id`. The current JavaScript `healthcareDispatchGate` compares a clearance's `clientId` to `order.client_id`; therefore its existing contract cannot be treated as a verified mapping for real database rows. Align this to the account/tenant ownership chain before enabling it.

The staging credentialing proposal records a single provider per facility and a facility/technician clearance with status, verification date, expiration, verifier identity, and tenant keys. This does **not** yet establish verified per-requirement evidence, evidence provenance, or a trusted verifier ingestion process. The pure `evaluateHealthcareClearance` helper requires a nonempty list of facility requirements, but the staging SQL has no requirements/evidence tables. These are separate, incomplete models.

## Authoritative dispatch eligibility contract (planned)

Server-side evaluation must reject unless **all** are true:

1. Work order is `HEALTHCARE_MDR`, belongs to the authenticated/authorized tenant, and has an account and facility belonging to that tenant. A facility is enrolled in the same tenant.
2. Requested technician is active, explicitly enrolled in that tenant, and matches the assigned technician on the request.
3. Facility provider policy is verified, current on the service date, and matches the provider on technician clearance. A missing expiry policy must be explicitly defined and approved; default deny.
4. Clearance belongs to the **same tenant + facility + technician + provider** and is VERIFIED with trustworthy evidence of who verified it, when, and its expiry. The verification date must be no later than the service date and expiry must cover the entire service date.
5. All required hospital access checks have independently verified evidence (if requirements are modeled). Unknown, absent, suspended, expired, or mismatched records deny.
6. Service date is a valid date; evaluate dates using hospital-local date semantics. Date/time conversion and policy expiration boundaries must be specified.
7. Clearance decision is created and checked on the server **within the assignment/status transaction**; a client-provided `source: SERVER_VERIFIED` or `eligible: true` must never authorize a database write.
8. Credential revocation or facility policy change invalidates earlier decisions; do not rely on stale client-side clearance.
9. All permitted status transitions and alternative write paths are subject to the same database checks. Cancellation remains possible without assignment progression.

## Unresolved implementation choices

- Choose the authoritative credential source, authorized verifier role and auditable ingestion/approval procedure.
- Model facility requirements and per-requirement evidence or explicitly remove that requirement from the pure helper only after hospital approval.
- Reconcile `clientId` versus `account_id` and ensure `tenant_id` is included throughout; never infer tenant from user-provided identifiers.
- Verify `melrah_dispatch_assign` and `melrah_dispatch_set_status` signatures and all other database writers in a disposable full-schema environment.
- Determine whether policy `expires_at` is required and how timestamp expiry maps to hospital-local scheduled dates.
- Add tenant-negative, revoked, stale, duplicate, cross-provider, concurrent assignment, and direct-RPC integration tests.
- Confirm RLS, grants, SECURITY DEFINER behavior, audit logs and operational rollback before any production application.

## Release gates

**Gate A:** isolated SQL trigger tests pass (not sufficient for deployment).
**Gate B:** disposable full-schema integration tests prove both RPCs fail closed for unauthorized requests.
**Gate C:** trusted verifier provenance, evidence, tenant binding, revocation, and audit tests pass.
**Gate D:** controlled Supabase staging deployment and end-to-end user acceptance.
**Gate E:** separately approved production migration with rollback plan and monitoring.

**No live Supabase changes or additional paid infrastructure are required to review this contract.**
