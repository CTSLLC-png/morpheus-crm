#!/usr/bin/env bash
set -euo pipefail
EXCEPTION_ID=00000000-0000-0000-0000-000000000005
# Session A simulates dispatch: holds the approval row lock for four seconds.
psql -X -v ON_ERROR_STOP=1 <<SQL &
BEGIN;
SELECT (melrah.healthcare_exception_lock_for_dispatch('$EXCEPTION_ID')).decision;
SELECT pg_sleep(4);
COMMIT;
SQL
holder=$!
sleep 1
# Session B attempts to withdraw. It must wait for the lock, then timeout.
set +e
output=$(psql -X -v ON_ERROR_STOP=1 -c "SET statement_timeout='1000ms'; UPDATE melrah.healthcare_access_exception SET decision='WITHDRAWN' WHERE id='$EXCEPTION_ID';" 2>&1)
code=$?
set -e
if [[ $code -eq 0 || "$output" != *"canceling statement due to statement timeout"* ]]; then
 echo "FAIL: hospital withdrawal did not wait for dispatch row lock"
 echo "$output"
 wait "$holder" || true
 exit 1
fi
wait "$holder"
psql -X -v ON_ERROR_STOP=1 -c "UPDATE melrah.healthcare_access_exception SET decision='WITHDRAWN' WHERE id='$EXCEPTION_ID';"
set +e
output=$(psql -X -v ON_ERROR_STOP=1 -c "SELECT melrah.healthcare_exception_lock_for_dispatch('$EXCEPTION_ID');" 2>&1)
code=$?
set -e
if [[ $code -eq 0 || "$output" != *"Hospital exception unavailable for dispatch"* ]]; then
 echo "FAIL: withdrawn approval remained eligible"
 echo "$output"
 exit 1
fi
echo "PASS: withdrawal serialized and withdrawn approval denied"
