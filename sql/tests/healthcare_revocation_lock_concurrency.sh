#!/usr/bin/env bash
set -euo pipefail
# Two independent PostgreSQL sessions. Session A holds the dispatch lock.
# Session B attempts a revocation with a short statement timeout; it MUST wait.
psql -X -v ON_ERROR_STOP=1 <<'SQL' &
BEGIN;
SELECT melrah.healthcare_lock_credential_scope(
 '00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-000000000004');
SELECT pg_sleep(4);
COMMIT;
SQL
holder=$!
sleep 1
set +e
output=$(psql -X -v ON_ERROR_STOP=1 -c "SET statement_timeout='1000ms'; UPDATE melrah.healthcare_credential_evidence SET status='REVOKED' WHERE id='00000000-0000-0000-0000-000000000001';" 2>&1)
code=$?
set -e
if [[ $code -eq 0 || "$output" != *"canceling statement due to statement timeout"* ]]; then
 echo "FAIL: concurrent revocation did not wait for credential lock"
 echo "$output"
 wait "$holder" || true
 exit 1
fi
wait "$holder"
psql -X -v ON_ERROR_STOP=1 -c "UPDATE melrah.healthcare_credential_evidence SET status='REVOKED' WHERE id='00000000-0000-0000-0000-000000000001';"
test "$(psql -XAt -c "SELECT status FROM melrah.healthcare_credential_evidence WHERE id='00000000-0000-0000-0000-000000000001'")" = "REVOKED"
echo "PASS: concurrent revocation waits; revocation succeeds after lock release"
