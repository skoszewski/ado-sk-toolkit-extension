#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <vsix-path> <publisher-id> <org1> [org2] [org3] ..."
  echo "Requires environment variable AZDO_PAT to be set."
  exit 1
fi

if [[ -z "${AZDO_PAT:-}" ]]; then
  echo "AZDO_PAT is not set."
  exit 1
fi

VSIX_PATH="$1"
PUBLISHER_ID="$2"
shift 2

for ORG in "$@"; do
  echo "Publishing to organization: $ORG"
  npx tfx-cli extension publish \
    --vsix "$VSIX_PATH" \
    --publisher "$PUBLISHER_ID" \
    --token "$AZDO_PAT" \
    --share-with "$ORG"
done
