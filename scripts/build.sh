#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TASK_DIR="$ROOT_DIR/task/AzureFederatedAuth"
BUILD_DIR="$ROOT_DIR/build"

cd "$TASK_DIR"
rm -rf dist node_modules
npm ci
npm run build

cd "$ROOT_DIR"
mkdir -p "$BUILD_DIR"
npx tfx-cli extension create \
  --manifest-globs vss-extension.json \
  --output-path "$BUILD_DIR"
