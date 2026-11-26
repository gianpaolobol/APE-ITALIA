#!/usr/bin/env bash
# Only called for explicit connected test distribution, not build-only.
set -euo pipefail
node scripts/verify-mobile-test-config.mjs
body=$(mktemp)
trap 'rm -f "$body"' EXIT
# No redirect, no insecure TLS, no remote body in logs, bounded response.
if ! status=$(curl --silent --show-error --output "$body" --write-out '%{http_code}' \
  --proto '=https' --connect-timeout 5 --max-time 15 --max-filesize 65536 \
  "$EXPO_PUBLIC_API_BASE_URL/health"); then
  echo "::error::Staging API HTTPS request failed"
  exit 1
fi
if [ "$status" != 200 ]; then
  echo "::error::Staging API health did not return HTTP 200"
  exit 1
fi
node scripts/verify-staging-health.mjs "${GITHUB_SHA:?Missing expected build revision}" < "$body"
echo "Staging API served the expected build revision"
