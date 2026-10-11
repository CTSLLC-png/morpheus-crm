#!/usr/bin/env bash
set -euo pipefail
TENANT=00000000-0000-0000-0000-000000000001
FACILITY=00000000-0000-0000-0000-000000000002
psql -X -v ON_ERROR_STOP=1 <<SQL &
BEGIN;
SELECT melrah.healthcare_lock_facility_policy('$TENANT','$FACILITY');
SELECT pg_sleep(6);
COMMIT;
SQL
holder=$!
sleep 1
for action in policy requirement approver; do
 case "$action" in
  policy) query="UPDATE melrah.healthcare_facility_credentialing SET policy_status='REVOKED' WHERE id='00000000-0000-0000-0000-000000000004'";;
  requirement) query="UPDATE melrah.healthcare_facility_requirement SET active=false WHERE id='00000000-0000-0000-0000-000000000005'";;
  approver) query="UPDATE melrah.healthcare_facility_approver SET active=false WHERE id='00000000-0000-0000-0000-000000000006'";;
 esac
 set +e
 output=$(psql -X -v ON_ERROR_STOP=1 -c "SET statement_timeout='1000ms'; $query;" 2>&1)
 code=$?
 set -e
 if [[ $code -eq 0 || "$output" != *"canceling statement due to statement timeout"* ]]; then
  echo "FAIL: $action change bypassed facility lock"
  echo "$output"
  wait "$holder" || true
  exit 1
 fi
done
wait "$holder"
psql -X -v ON_ERROR_STOP=1 -c "UPDATE melrah.healthcare_facility_credentialing SET policy_status='REVOKED'; UPDATE melrah.healthcare_facility_requirement SET active=false; UPDATE melrah.healthcare_facility_approver SET active=false;"
test "$(psql -XAt -c "SELECT policy_status FROM melrah.healthcare_facility_credentialing")" = "REVOKED"
test "$(psql -XAt -c "SELECT active FROM melrah.healthcare_facility_requirement")" = "f"
test "$(psql -XAt -c "SELECT active FROM melrah.healthcare_facility_approver")" = "f"
echo "PASS: policy, requirement, approver edits all wait for shared facility lock"
