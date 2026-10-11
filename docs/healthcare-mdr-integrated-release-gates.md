# Healthcare MDR: integrated release gate and test inventory

**Status: BLOCKED.** This is an engineering audit, not approval to deploy.
Healthcare dispatch must remain disabled until all gates below are evidenced.

## Verified by source inspection (not by successful CI execution)

| Boundary | Repository evidence | What is not yet demonstrated |
| --- | --- | --- |
| Existing assignment RPC | `sql/tests/healthcare_assign_rpc_source.sql` mirrors source SQL; `sql/tests/healthcare_assign_rpc_integration.sql` | Exact live production function parity and actual server guard deployed |
| Healthcare work-order trigger | `sql/proposals/healthcare_dispatch_server_guard.sql` | Production installation, all writer paths and privileged bypass audit |
| Credential eligibility | `sql/proposals/healthcare_evidence_eligibility_readonly.sql` | Full staging schema, multiple provider handling, timezone-specific visit time |
| Unified preflight | `sql/proposals/healthcare_dispatch_preflight_integrated_disabled.sql` | Authorization intentionally disabled; no RPC dispatch integration |
| Hospital exception | `sql/proposals/healthcare_access_exception_staging.sql`, `healthcare_exception_visit_scope.sql`, `healthcare_exception_withdrawal_lock.sql` | Trusted facility authorization, immutable event ingestion, complete cross-table scope constraints |
| Hospital approver | `sql/proposals/healthcare_approver_verification_provenance.sql`, `healthcare_approver_verification_integrity.sql` | Real-world identity proof and independently authenticated intake |
| Concurrency | `healthcare_integrated_safety_lock_order.sql`, `healthcare_facility_policy_serialization.sql` | All mutation paths and full transaction lock ordering in actual dispatch |

## Critical release gates — do not bypass

1. **Confirm CI**: inspect GitHub Actions runs and logs for PRs #94–#99; merged is not proof tests passed. Fix failures before adding more features.
2. **Production baseline (read only)**: capture `pg_get_functiondef` for both live RPCs, trigger definitions, table columns, policies and grants. Compare with committed SQL. Never assume fixture matches production.
3. **Single representative disposable PostgreSQL integration**: apply the real parent tables, real proposed credential and exception staging, real guard, real eligibility, real preflight and actual RPCs in dependency order. No stubs for the authorization-critical paths.
4. **Negative scenarios**: wrong tenant/account/facility, inactive technician, no requirement, expired/duplicate/revoked evidence, no approver proof, approver revoked, visit or technician mismatch, expired/withdrawn/used exception, conduct ban, direct INSERT/UPDATE and RPC bypass attempts. Assert exact SQLSTATE and zero partial writes.
5. **Concurrent scenarios**: two sessions racing dispatch vs facility-policy changes, evidence revocation, hard-stop insertion, exception withdrawal, approver revocation and assignment to same visit. Verify lock ordering and rollback.
6. **Privilege audit**: RLS and `EXECUTE` / table DML as `anon`, `authenticated`, tenant member and non-member; check service-role/SECURITY DEFINER and alternate write paths. No client may forge hospital identity or VERIFIED evidence.
7. **Hospital operational workflow**: independently verify hospital official via out-of-band directory callback, signed attestation or hospital IdP; record verifier, method and evidence; require Melrah second reviewer and hospital approval per visit. Conduct bans, safety and legal prohibitions never waivable.
8. **Policy/legal approval**: define waivable vs non-waivable requirements with hospital contract owner and counsel; account for hospital-local scheduled timestamp, audit retention and PHI/data minimization.
9. **Controlled deployment**: prepare reversible migration, backup, staging test and monitoring. Obtain explicit owner approval for production SQL changes; install fail-closed guard *before* any enabled dispatch path.
10. **Pilot acceptance**: hospital stakeholder signs off on one non-production simulated visit, one exception, one revoked approver, one conduct ban, and audit export. Only then consider a restricted live pilot.

## Immediate engineering sequence

**A.** Confirm Actions and fix red workflows. **B.** Build one full-schema disposable test using real proposal SQL, without authorization stubs. **C.** Audit production read-only and reconcile schema differences. **D.** Implement trusted ingestion and immutable verification provenance. **E.** Obtain explicit approval for controlled production migrations. **F.** Pilot with a named facility.

## Important design limitation

`healthcare_evidence_eligible` currently requires *all* required evidence VERIFIED. An approved administrative exception does not automatically substitute for missing evidence. The preflight checks eligibility before evaluating the optional exception, so the exception cannot presently enable an otherwise-ineligible technician even if future dispatch were enabled. **Do not silently change this**: design and test requirement-level waivers with hard-stop precedence, independent hospital authority and non-waivable classifications before enabling dispatch.

## Cost and status

Use disposable GitHub Actions PostgreSQL and read-only production inspection. Do not create paid Supabase branches or change production without authorization. **All healthcare authorization SQL discussed here remains proposal-only; merged GitHub PRs are not production deployments.**
