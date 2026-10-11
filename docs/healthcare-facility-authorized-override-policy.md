# Melrah Healthcare — Facility-Authorized Exception and Hard-Stop Policy

**Status:** design proposal only; no production authorization or dispatch changes.
**Purpose:** preserve hospital collection continuity without permitting unauthorized facility access.

## Decision hierarchy

1. **HARD STOP — no override:** conduct-related dismissal, explicit facility ban, safety/security exclusion, active legal/regulatory prohibition, or mandatory credential lacking an authorized waiver. Cancel the technician's access and dispatch an independently cleared substitute. A Melrah administrator cannot waive a hospital prohibition.
2. **UNKNOWN REASON — hold:** when evidence is REVOKED or SUSPENDED and the cause is not established, deny dispatch for that technician. Obtain authoritative facility/provider disposition before classifying the issue. Never infer that revocation is administrative.
3. **ADMINISTRATIVE EXCEPTION — conditional:** expired documentation, renewal processing, credentialing-system mismatch or another facility-designated waivable issue may be covered by a **written facility authorization** that explicitly permits the identified technician to enter and perform the identified work. This is a temporary exception, **not reinstatement** of the underlying credential.
4. **STANDARD VERIFIED — normal clearance:** all required facility credentials and policies verified and current.

## Authority and dual control

- Only a facility-designated credentialing/security authority may approve a facility-access exception; verify the approver against an independently maintained facility authorization roster.
- Melrah operations may request an exception and confirm scheduling but **cannot approve its own request** or impersonate facility authorization.
- A second Melrah reviewer must acknowledge the authorization and ensure the visit remains within scope. Reviewer acknowledgment does not replace facility permission.
- Any requirement that cannot legally or contractually be waived remains a hard stop, regardless of facility convenience.
- Emergency access restrictions take precedence over previously issued exceptions.

## Minimum audit record (proposed)

- Immutable override ID; tenant ID; account ID; facility ID; work order ID; technician ID; provider and requirement IDs.
- Reason classification: ADMIN_DOCUMENT, RENEWAL_PENDING, PROVIDER_SYNC, OTHER_APPROVED, HARD_STOP, UNKNOWN.
- Evidence of original adverse credential event; original status and timestamp; reason-source provenance.
- Written facility authorization reference, authenticated approver identity and authority verification, authorization timestamp, exact permitted activities and facility/visit scope.
- Melrah requestor and separate reviewer identity; request/review timestamps; approval/denial decision; UTC expiry timestamp; facility-local time zone.
- Append-only audit history, explicit revocation and supersession events; never overwrite original evidence status.
- Hospital contact and alternative technician plan if approval is denied or withdrawn.

## Operational rules

- Exception defaults to **DENIED**. No request can become effective merely because it was created or submitted.
- Approval must be explicit, independently verified, facility-specific, technician-specific, visit-specific and time-bounded. One-time use by default.
- Expiry no later than visit completion; choose a shorter deadline if the hospital requires.
- If facility authorization is withdrawn, the visit is cancelled/paused for that technician immediately and the substitute workflow begins.
- Unknown, ambiguous, duplicated, conflicting or stale authorizations fail closed.
- Service continuity priority: dispatch another fully credentialed technician whenever possible. Escalate to facility for any proposed exception.
- Do not allow overrides of hard-stop categories or legal/contractual mandatory restrictions.
- Do not change source evidence from REVOKED to VERIFIED to simulate a waiver.

## Planned server contract (NOT IMPLEMENTED)

A future server-side assignment function must verify either:
- normal credential eligibility under the hospital's requirements; **or**
- a fully authenticated, facility-authorized exception that applies to a specifically designated **waivable** requirement and the exact visit.

For either route it must verify there is no current hard-stop exclusion, enforce the correct tenant/account/facility/technician scope, lock the work order and relevant credential/exception state, and serialize revocations and facility authorization withdrawals. The server must check the exception at the moment of assignment and again before access/visit progression. Any new hard stop must supersede prior exceptions.

## Acceptance tests before any production release

1. Verified technician passes normal path.
2. Revoked with unknown reason denied.
3. Administrative exception requested but not facility-approved denied.
4. Valid written, independently authenticated facility exception for specific technician, requirement, and visit permits only that scope (after explicit dispatch enablement).
5. Wrong facility, tenant, technician, requirement, work order, approver, or expired exception denied.
6. Conduct-related dismissal, explicit ban, safety/security exclusion and non-waivable requirement denied **even with an exception record**.
7. Facility withdrawal races assignment: transaction must not succeed using withdrawn authorization.
8. One-time exception cannot be reused on another visit.
9. All request/approval/review/withdrawal transitions are audit logged and original evidence remains unchanged.
10. Normal coffee/cannabis dispatch is unaffected.

## Release gates

Facility-specific policy signoff; legal/compliance review of waivable versus non-waivable requirements; authority-roster validation; audited approval and withdrawal ingestion; privilege/RLS review; multi-session PostgreSQL concurrency tests; actual RPC/trigger integration; production change approval.

**Until these gates pass, the existing healthcare dispatch block stays in force.**
