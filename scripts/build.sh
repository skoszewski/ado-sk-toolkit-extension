#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
SHARED_DIR="$ROOT_DIR/shared"
SHARED_TGZ_PATH="$BUILD_DIR/ado-sk-toolkit-shared.tgz"

mkdir -p "$BUILD_DIR"

cd "$SHARED_DIR"
rm -rf dist node_modules
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install --no-audit --fund=false
fi
npm run build

PACKED_SHARED_TGZ="$(npm pack --pack-destination "$BUILD_DIR")"
cp -f "$BUILD_DIR/$PACKED_SHARED_TGZ" "$SHARED_TGZ_PATH"

for TASK_DIR in "$ROOT_DIR"/task/*; do
  if [[ -f "$TASK_DIR/package.json" && -f "$TASK_DIR/tsconfig.json" ]]; then
    cd "$TASK_DIR"
    rm -rf dist node_modules
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install --no-audit --fund=false
    fi
    npm install --no-save "$SHARED_TGZ_PATH"
    npm run build
  fi
done

cd "$ROOT_DIR"
npx tfx-cli extension create \
  --manifest-globs vss-extension.json \
  --output-path "$BUILD_DIR"
