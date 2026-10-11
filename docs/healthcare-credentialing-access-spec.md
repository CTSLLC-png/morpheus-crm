# MDR Credentialing & Facility Access — acceptance specification

## Distinct concepts
1. Technician qualification: trained/authorized to perform a customer's MDR collection procedure.
2. Vendor organization registration: Melrah's registration with each hospital/network and third-party credentialing vendor.
3. Individual representative clearance: technician-specific credentialing and badge/appointment clearance.
4. Facility access: per-facility permissions, departments, visit purpose, dates, escorts, and check-in rules.

Supported provider directory (configurable, NOT an endorsement or API integration): symplr, GHX Vendormate, IntelliCentrics SEC³URE, direct hospital portal, other/manual.

## Minimum records
- Credentialing provider, external account/reference ID, scope (company, technician, facility), required document type, responsible owner, renewal lead time.
- Evidence metadata (issuer, issued_at, expires_at, verified_at, verified_by, status, source URL); encrypted/private evidence storage with role-limited access, retention policy and audit log. **Never store passwords, MFA secrets, or portal recovery codes.**
- Facility policy version, access rules, required vendor/individual clearances, hospital verification source, last verified timestamp.
- Facility-specific representative registration and check-in instructions, badge status, escort rules and exceptions.
- Qualification and clearance decision evaluated for exact technician, customer, facility, appointment date and scope.

## Dispatch gate (fail closed)
- No confirmation when required qualification/registration/clearance missing, expired on visit date, suspended, or unverified.
- Unknown or stale hospital policy => manual verification required; do not mark automatically approved.
- Backup reassignment must re-evaluate ALL requirements; passing training alone is insufficient.
- 60/30/14/7-day renewal notifications; escalation to coordinator and manager; audit override with reason, authorized approver and expiry, subject to hospital policy. Overrides cannot replace hospital approval.
- Never claim a facility grants access based only on an uploaded document or technician self-attestation.

## Demonstration scenarios
- Technician A qualified for Cardinal but symplr facility badge expired => assignment blocked.
- Technician B has valid credentials but not registered for this hospital => blocked.
- Technician C cleared for same hospital but only Medtronic customer workflow => cannot be assigned to Cardinal without authorization.
- Qualified and cleared backup replaces absent technician; recorded evidence, audit event, notifications.
- Renewal alert does not reveal medical records to unauthorized dispatchers.

## Privacy/security and vendor integration
- Minimize health information. Prefer attestation/verified status over storing vaccination/test documents.
- Separate confidential personnel evidence from dispatch metadata, with least-privilege RLS, encryption and access logs.
- Verify whether each credentialing provider offers permitted APIs and terms before automation; no scraping or credential sharing.
- Hospital policies and customer contracts control access; rules differ by site and can change.
- Legal/privacy/compliance review before production deployment.
