#!/usr/bin/env bash
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to a disposable local PostgreSQL database}"
if [[ "$TEST_DATABASE_URL" != *localhost* && "$TEST_DATABASE_URL" != *127.0.0.1* && "$TEST_DATABASE_URL" != *jobdashboard-pg* ]]; then
  echo 'Database contract tests only run against a local disposable database.' >&2
  exit 1
fi
psql "$TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f __tests__/db/base.sql
psql "$TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f scripts/sql/create-scraper-runs.sql
psql "$TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f scripts/sql/ai-enrichment.sql
psql "$TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f scripts/sql/2026-10-10-architecture.sql
psql "$TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f scripts/sql/2026-10-11-source-provenance.sql
psql "$TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f scripts/sql/2026-10-12-source-summary.sql
psql "$TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f __tests__/db/contracts.sql

# Two separate clients must never claim the same queued source version.
psql "$TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -c "update public.jobs set source_content_hash='hash-four' where external_job_id='amazon_1'"
result_dir=$(mktemp -d)
trap 'rm -rf "$result_dir"' EXIT
psql "$TEST_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c "select public.claim_ai_enrichment('gemma4:31b')" > "$result_dir/claim1" &
first_pid=$!
psql "$TEST_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c "select public.claim_ai_enrichment('gemma4:31b')" > "$result_dir/claim2" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"
first_claim=$(cat "$result_dir/claim1")
second_claim=$(cat "$result_dir/claim2")
if [[ ( -n "$first_claim" && -n "$second_claim" ) || ( -z "$first_claim" && -z "$second_claim" ) ]]; then
  echo 'Concurrent queue claim was not exclusive.' >&2
  exit 1
fi

psql "$TEST_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c "select public.consume_ai_enrichment_quota(current_date,'concurrent-model',1)" > "$result_dir/quota1" &
first_pid=$!
psql "$TEST_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c "select public.consume_ai_enrichment_quota(current_date,'concurrent-model',1)" > "$result_dir/quota2" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"
if [[ "$(cat "$result_dir/quota1")$(cat "$result_dir/quota2")" != 'tf' &&
      "$(cat "$result_dir/quota1")$(cat "$result_dir/quota2")" != 'ft' ]]; then
  echo 'Concurrent quota consumption exceeded its cap.' >&2
  exit 1
fi
