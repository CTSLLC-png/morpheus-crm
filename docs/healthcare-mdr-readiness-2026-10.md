# Nguzo OS Healthcare / MDR Readiness — PM Workstream
Date: 2026-10-11 | Status: AUDIT / DESIGN ONLY | Owner: Melrah Environmental Services

## Verified baseline
- GitHub: Provider Networks (`Accounts.jsx`), work orders/custody ledger (`WorkOrders.jsx`), dispatch (`Dispatch.jsx`), field module, database migrations.
- Live Supabase project `ymavrmekxiwdphdyteau`: 1 account, 0 facilities, 2 work orders, 1 field resource, 0 work-order visits, 0 rate cards, 0 invoices (read-only inspection 2026-10-11).
- SQL seed `0003_melrah_seed.sql` defines 2 mock accounts, 5 mock facilities and demo work orders, but does **not** appear fully deployed. Do not blindly execute seed: inspect triggers, dependencies, IDs, existing rows, and security first.
- `dispatchIntelligence.js` explicitly filters to `ORGANICS_COFFEE` and `CANNABIS_PACKAGING`: MDR currently excluded.
- Work-order status state machine and field status state machine differ; reconcile before extending.
- Healthcare workflow completeness and deployed authorization boundaries are NOT verified.

## Target architecture
- Shared infrastructure: auth, tenant identity, scheduling primitives, audit events, workforce roster, notifications.
- Distinct service programs: healthcare MDR, cannabis packaging, coffee organics. Enforce program/customer permissions at database level; UI filtering alone is insufficient.
- Healthcare hierarchy: contracting client (Sustainable Technologies vs Medtronic) -> provider network -> facility -> collection point -> recurring service requirement -> monthly scheduled visits -> assigned qualified technician -> service evidence -> supervisory approval -> invoice.
- Never co-mingle device collections, manifests, work orders, chain of custody or billing between competing clients.
- Maintain an isolated, explicitly DEMO-labelled dataset; do not use historical customer rosters or confidential Arcwood information.

## Delivery gates (do not claim production-ready before all pass)
1. **Data and security**: map schema, migration history, grants, RLS, view security_invoker, RPC authorization, role scopes, tenant/customer separation. Test cross-client read/write denial with two distinct test identities.
2. **Demo fixtures**: restore idempotent, isolated mock hospital networks and five or more mock facilities after reviewing existing seed. Verify counts and no collisions with live operational programs.
3. **Monthly planning**: recurring rules, technician availability/qualifications, PTO/exams, assignment conflict checks, publication/freeze, schedule revisions and notifications.
4. **Contingency**: primary + qualified backup, absence escalation, unstaffed stop alerts, service recovery, manual override with audit trail.
5. **Execution**: mobile visit start/end, offline replay/idempotency, collection segregation, evidence and custody records, supervisor exceptions.
6. **Commercial**: account-specific rate cards, paid travel/mileage rules, approval of visits and hours, invoice preview/reconciliation, accounting export.
7. **Operational testing**: automated unit/integration tests, refresh persistence, RLS negative tests, mobile field smoke tests, two-client same-facility different-day scenario (Burlington example).
8. **Production readiness**: backup/restore drill, logging, incident response, privacy/security review, training SOPs, regulatory counsel/customer review, signed customer procedures and service SLAs.

## Acceptance scenario: Burlington dual-client service
- Fictional Burlington facility linked to TWO separate contracting client programs.
- Different service days, separate qualified assignments, separate collection instructions, segregated work orders/evidence/invoices.
- Technician may be shared only if both customer agreements permit.
- One technician calls out: qualified backup offered, dispatch alerted, missed-visit risk visible.
- Client A cannot view or modify client B's work or data.

## PM priorities
P0: authorization/customer isolation; dispatch persistence; migration/fixture reconciliation.
P1: recurring monthly scheduling, coverage, qualification matching, service approvals, billing.
P2: campus recruitment pipeline, capacity forecasting, executive KPI dashboard.
KPIs: scheduled-service completion, on-time completion, backup coverage, collection exceptions, approved billable hours, invoice accuracy, margin after travel and overhead.

## Change-control
No production migration, external communication, hiring, payment, or customer commitment without explicit review of the specific consequential action. Build/test on isolated branch and staging data first.
