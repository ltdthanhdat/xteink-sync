#!/usr/bin/env sh
set -eu

REPO="${REPO:-ltdthanhdat/xteink-sync}"
GITHUB_HOST="${GITHUB_HOST:-github.com}"
PREFIX="${PREFIX:-$HOME/.local}"
BIN_DIR="${BIN_DIR:-$PREFIX/bin}"
VERSION="${VERSION:-latest}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

download() {
  url="$1"
  output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
    return
  fi

  echo "error: either curl or wget is required" >&2
  exit 1
}

detect_target() {
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux)
      os_part="linux"
      ;;
    Darwin)
      os_part="macos"
      ;;
    *)
      echo "error: unsupported OS: $os" >&2
      exit 1
      ;;
  esac

  case "$arch" in
    x86_64|amd64)
      arch_part="x64"
      ;;
    arm64|aarch64)
      arch_part="arm64"
      ;;
    *)
      echo "error: unsupported architecture: $arch" >&2
      exit 1
      ;;
  esac

  printf "%s-%s" "$os_part" "$arch_part"
}

require_cmd tar

target="$(detect_target)"
asset="xteink-sync-${target}.tar.gz"
base_url="https://${GITHUB_HOST}/${REPO}/releases"

if [ "$VERSION" = "latest" ]; then
  archive_url="${base_url}/latest/download/${asset}"
else
  archive_url="${base_url}/download/${VERSION}/${asset}"
fi

tmp_dir="$(mktemp -d)"
archive_path="${tmp_dir}/${asset}"

trap 'rm -rf "$tmp_dir"' EXIT INT TERM

mkdir -p "$BIN_DIR"

echo "Downloading ${asset}..."
download "$archive_url" "$archive_path"

tar -xzf "$archive_path" -C "$tmp_dir"
install_path="${BIN_DIR}/xteink-sync"
mv "${tmp_dir}/xteink-sync" "$install_path"
chmod +x "$install_path"

echo "Installed xteink-sync to ${install_path}"
echo "Run: xteink-sync"
