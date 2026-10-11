# Centralized healthcare credentialing operating model
Decision: 2026-10-11. Owner: Melrah Healthcare Operations.
Source: founder's experience with individually managed technician credentials causing lapses.

## Ownership
- Credentialing coordinator owns the master requirements matrix, evidence review, provider registration status, expiry calendar, renewal follow-up, exception escalation, and facility confirmation.
- Technician owns truthful submission of personal documents, training completion, individual portal actions when required, and immediate notice of changed status.
- Operations manager approves staffing plans only after facility-specific clearance is verified.
- A coordinator's internal approval never substitutes for hospital or credentialing-vendor approval.

## Workflow
1. Onboard customer/facility; verify credentialing vendor (symplr, GHX Vendormate, other), exact registration process, facility requirements, owner, and policy review date.
2. Onboard technician with customer-specific training, role qualification, and secure document collection.
3. Coordinator reviews evidence, confirms external portal status from an authorized source, and records verifier/date/expiry.
4. Monthly scheduler checks each technician against the actual visit date and customer/facility.
5. Renewal queues trigger at 60/30/14/7 days, with coordinator escalation and backup coverage planning.
6. Suspended/expired/unknown statuses fail closed; facility-access exceptions require verified external authorization.
7. Supervisor reviews weekly compliance exceptions and staffing gaps; retain audit trail.

## Dashboard minimum
- Technicians with pending/expiring/expired clearance, per facility/customer and vendor.
- Upcoming visits at risk from credentials expiring before service date.
- Unverified facility policies and pending external registrations.
- Backup coverage eligibility and renewal ownership.
- No sensitive medical documents visible to dispatch-only roles.

## Controls
- Do not store third-party portal passwords, recovery codes, or MFA secrets.
- Individual vendor accounts remain individual where terms require; coordinator may administer permitted organization-level tools.
- Encrypt private evidence, minimize medical information, apply retention rules and least-privilege access.
- Document approval provenance; audit changes and manual exceptions.
- This document defines operational requirements, not implemented software or external API integrations.

## Acceptance test
Technician A's symplr clearance expires before a scheduled visit. System alerts coordinator 60 days ahead, marks the visit at risk, blocks unverified dispatch, and suggests only a technician whose client- and facility-specific clearance is current. Coordinator can see renewal tasks without seeing unnecessary sensitive medical data.
