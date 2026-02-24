#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"

for TASK_DIR in "$ROOT_DIR"/task/*; do
  if [[ -f "$TASK_DIR/package.json" && -f "$TASK_DIR/tsconfig.json" ]]; then
    cd "$TASK_DIR"
    rm -rf dist node_modules
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install --no-audit --fund=false
    fi
    npm run build
  fi
done

cd "$ROOT_DIR"
mkdir -p "$BUILD_DIR"
npx tfx-cli extension create \
  --manifest-globs vss-extension.json \
  --output-path "$BUILD_DIR"
