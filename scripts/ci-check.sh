#!/usr/bin/env bash
set -euo pipefail

run_step() {
  local label=$1
  shift
  local started=$SECONDS

  echo "::group::$label"
  if "$@"; then
    echo "$label completed in $((SECONDS - started))s"
    echo '::endgroup::'
  else
    local status=$?
    echo "$label failed after $((SECONDS - started))s (exit $status)"
    echo '::endgroup::'
    return "$status"
  fi
}

run_step 'Install dependencies' yarn install --frozen-lockfile
if [[ ${GITHUB_ACTIONS:-} == true ]]; then
  run_step 'Install Playwright Chromium' yarn playwright install --with-deps chromium
fi
run_step 'TypeScript' yarn tsc --noEmit
run_step 'ESLint' yarn lint
run_step 'Design lint' yarn lint:design
run_step 'Assert probes' yarn test
