#!/usr/bin/env bash
set -euo pipefail
TENANT=00000000-0000-0000-0000-000000000001
FACILITY=00000000-0000-0000-0000-000000000002
TECH=00000000-0000-0000-0000-000000000003
# Dispatch-shaped transaction holds both locks while validating.
psql -X -v ON_ERROR_STOP=1 <<SQL &
BEGIN;
SELECT melrah.healthcare_lock_dispatch_safety_scope('$TENANT','$FACILITY','$TECH');
SELECT pg_sleep(5);
COMMIT;
SQL
holder=$!
sleep 1
for action in ban revocation; do
 set +e
 if [[ "$action" == ban ]]; then
  output=$(psql -X -v ON_ERROR_STOP=1 -c "SET statement_timeout='1000ms'; INSERT INTO melrah.healthcare_access_exclusion(tenant_id,facility_id,technician_id,reason_code) VALUES ('$TENANT','$FACILITY','$TECH','CONDUCT_DISMISSAL');" 2>&1)
 else
  output=$(psql -X -v ON_ERROR_STOP=1 -c "SET statement_timeout='1000ms'; UPDATE melrah.healthcare_credential_evidence SET status='REVOKED' WHERE id='00000000-0000-0000-0000-000000000004';" 2>&1)
 fi
 code=$?
 set -e
 if [[ $code -eq 0 || "$output" != *"canceling statement due to statement timeout"* ]]; then
  echo "FAIL: $action did not serialize behind combined safety lock"
  echo "$output"
  wait "$holder" || true
  exit 1
 fi
done
wait "$holder"
psql -X -v ON_ERROR_STOP=1 -c "INSERT INTO melrah.healthcare_access_exclusion(tenant_id,facility_id,technician_id,reason_code) VALUES ('$TENANT','$FACILITY','$TECH','CONDUCT_DISMISSAL');"
psql -X -v ON_ERROR_STOP=1 -c "UPDATE melrah.healthcare_credential_evidence SET status='REVOKED' WHERE id='00000000-0000-0000-0000-000000000004';"
test "$(psql -XAt -c "SELECT count(*) FROM melrah.healthcare_access_exclusion WHERE active")" = "1"
test "$(psql -XAt -c "SELECT status FROM melrah.healthcare_credential_evidence WHERE id='00000000-0000-0000-0000-000000000004'")" = "REVOKED"
echo "PASS: ban and revocation both wait for combined safety scope and commit afterward"
