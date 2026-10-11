#!/usr/bin/env bash
set -euo pipefail
# A hypothetical dispatcher holds access scope; hospital bans must serialize.
psql -X -v ON_ERROR_STOP=1 <<'SQL' &
BEGIN;
SELECT melrah.healthcare_lock_access_scope(
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000003');
SELECT pg_sleep(4);
COMMIT;
SQL
holder=$!
sleep 1
set +e
output=$(psql -X -v ON_ERROR_STOP=1 -c "SET statement_timeout='1000ms'; INSERT INTO melrah.healthcare_access_exclusion(tenant_id,facility_id,technician_id,reason_code,facility_reference,effective_at) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','CONDUCT_DISMISSAL','hospital-ban',now());" 2>&1)
code=$?
set -e
if [[ $code -eq 0 || "$output" != *"canceling statement due to statement timeout"* ]]; then
 echo "FAIL: hard-stop insertion did not wait for access scope lock"
 echo "$output"
 wait "$holder" || true
 exit 1
fi
wait "$holder"
psql -X -v ON_ERROR_STOP=1 -c "INSERT INTO melrah.healthcare_access_exclusion(tenant_id,facility_id,technician_id,reason_code,facility_reference,effective_at) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','CONDUCT_DISMISSAL','hospital-ban',now());"
test "$(psql -XAt -c "SELECT count(*) FROM melrah.healthcare_access_exclusion WHERE active AND reason_code='CONDUCT_DISMISSAL'")" = "1"
echo "PASS: hospital ban insertion serialized and committed after lock release"
