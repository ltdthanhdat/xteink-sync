#!/usr/bin/env sh
set -eu

BUN_BIN="${BUN_BIN:-bun}"
PREFIX="${PREFIX:-$HOME/.local}"
BIN_DIR="${BIN_DIR:-$PREFIX/bin}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
TARGET="$BIN_DIR/xteink-sync"

if ! command -v "$BUN_BIN" >/dev/null 2>&1; then
  echo "error: bun is not available in PATH" >&2
  exit 1
fi

mkdir -p "$BIN_DIR"

"$BUN_BIN" run build

cat >"$TARGET" <<EOF
#!/usr/bin/env sh
set -eu
exec "$BUN_BIN" "$REPO_DIR/dist/index.js" "\$@"
EOF

chmod +x "$TARGET"

echo "Installed xteink-sync to $TARGET"
