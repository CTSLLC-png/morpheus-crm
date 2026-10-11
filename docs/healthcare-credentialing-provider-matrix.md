# MDR credentialing provider registry and hospital matrix

Founder-reported systems from prior regional MDR collection operations (2026-10-11):
- IntelliCentrics SEC³URE (vendor key `INTELLICENTRICS`)
- symplr (`SYMPLR`)
- GHX Vendormate (`GHX_VENDOR_MATE`; founder described as "GHX conformance" — verify exact product at each hospital)
- Green Security (`GREEN_SECURITY`)

Names above are directory entries only; no integrations, API access, registration, or facility approval are implied.

## Facility credentialing requirements matrix
Fields: customer_id, network_id, facility_id, vendor_key, external_registration_reference, organization_registration_required, representative_registration_required, facility_policy_version, policy_verified_at, verifier_id, requirements[], check_in_rules, owner_id, renewal_window_days, last_portal_check_at.

## Individual technician clearance matrix
Fields: technician_id, customer_id, facility_id, vendor_key, clearance_status (UNKNOWN/PENDING/VERIFIED/EXPIRED/SUSPENDED), issuer_reference, verification_method, verified_by, verified_at, valid_from, expires_at, evidence_reference, followup_owner_id, next_action_at.

## Operating requirements
- Credentialing coordinator owns a central dashboard and renewal queue; technicians complete their individual portal steps and provide required evidence.
- Confirm whether each facility uses an organization account, individual representative account, or both.
- Track hospital-specific approvals separately even when they use the same vendor.
- Alert at 60/30/14/7 days; flag any scheduled visit beyond expiration.
- Block dispatch when verification is missing, expired or mismatched to technician/customer/facility/service date.
- Store no vendor passwords, MFA secrets, or unnecessary personal health documents; restrict access to private evidence.
- Never claim live vendor integrations or auto-verification without approved provider interfaces and testing.

## Example
A technician has a valid IntelliCentrics account for Hospital A but Hospital B requires Green Security and additional local clearance. Hospital B remains NOT CLEARED until independently verified.
