#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
BUILD_DIR="$ROOT_DIR/.build/pause-card.iinaplugin"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

cp "$ROOT_DIR/Info.json" "$BUILD_DIR/Info.json"
cp "$ROOT_DIR/main.js" "$BUILD_DIR/main.js"
cp "$ROOT_DIR/overlay.html" "$BUILD_DIR/overlay.html"
cp "$ROOT_DIR/preferences.html" "$BUILD_DIR/preferences.html"

printf '%s\n' "$BUILD_DIR"
