#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
REF_DIR="$ROOT_DIR/resourses/guessit-js-main"

if [ ! -d "$REF_DIR/node_modules" ]; then
  printf '%s\n' "Missing guessit-js dependencies. Run 'npm ci' in $REF_DIR first." >&2
  exit 1
fi

cd "$REF_DIR"
npm test -- --exclude test/wasm-full.test.ts
