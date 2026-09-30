#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
SOURCE_PATH="$ROOT_DIR/resourses/guessit-js-main/dist/guessit-js.cjs"
TARGET_DIR="$ROOT_DIR/vendor"
TARGET_PATH="$TARGET_DIR/guessit-js.cjs"

if [ ! -f "$SOURCE_PATH" ]; then
  printf '%s\n' "Missing source file: $SOURCE_PATH" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
cp "$SOURCE_PATH" "$TARGET_PATH"
# IINA's CommonJS loader does not reliably expose the bundle's `exports` alias.
printf '\nmodule.exports = exports;\n' >> "$TARGET_PATH"

printf '%s\n' "$TARGET_PATH"
