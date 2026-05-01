#!/usr/bin/env sh
set -eu

PREFIX="${PREFIX:-$HOME/.local}"
BIN_DIR="${BIN_DIR:-$PREFIX/bin}"
TARGET="$BIN_DIR/xteink-sync"

if [ -f "$TARGET" ]; then
  rm "$TARGET"
  echo "Removed $TARGET"
  exit 0
fi

echo "No local launcher found at $TARGET"
