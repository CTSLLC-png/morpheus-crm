# Composite-key security acceptance tests (staging only)

Do not run these as production mutations. Use two isolated test tenants and a transaction that is rolled back.

1. Create tenant A and tenant B, each with a different account and facility.
2. Create a technician enrolled only in tenant A via `healthcare_technician_tenant`.
3. Enroll facility A in `healthcare_facility_scope` with tenant A; create its primary provider policy.
4. Verify a matching clearance for technician A, facility A, provider A succeeds **only** under an authorized trusted writer.
5. Attempt clearance with tenant B and facility A: composite facility FK must reject.
6. Attempt clearance with tenant B and technician A: composite technician FK must reject.
7. Attempt clearance with a provider different from facility A's provider: composite provider FK must reject.
8. Attempt to insert a facility scope for facility A under tenant B: The proposed scope trigger must reject this. Test it against a separate tenant B. Also test subsequent account.tenant_id and facility.account_id reassignment attempts.
9. Confirm authenticated and anon cannot write any scope, enrollment, facility policy or clearance records.
10. Test authenticated owner of tenant A cannot SELECT tenant B rows; a non-owner must not SELECT tenant A records.
11. Verify revoked/suspended/expired clearance cannot authorize dispatch. Server-side dispatch enforcement is not implemented by this SQL.
12. Confirm verifier identity and source evidence are validated by a trusted server workflow, not accepted from browser input.

**Stop condition:** These triggers are a proposed fix, not verified enforcement. Test trigger concurrency, policy behavior, cross-tenant negative cases, and privilege boundaries in isolated staging before treating this as a deployable migration.
