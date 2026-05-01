# Xteink Sync

File sync for local machines and Xteink devices running CrossPoint firmware, with sync plan preview and sync history.

> CrossPoint firmware only.

![Bun](https://img.shields.io/badge/Bun-1.3+-000000?logo=bun&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-20232A?logo=react)
![Ink](https://img.shields.io/badge/Ink-TUI-111111)
![SQLite](https://img.shields.io/badge/SQLite-State-003B57?logo=sqlite&logoColor=white)
![CI](https://img.shields.io/github/actions/workflow/status/ltdthanhdat/xteink-sync/ci.yml?branch=master&label=CI)
![Release](https://img.shields.io/github/v/release/ltdthanhdat/xteink-sync?label=release)

[Download](#download) • [Quick Start](#quick-start) • [Workflow](#typical-workflow) • [Latest release](https://github.com/ltdthanhdat/xteink-sync/releases/latest) • [All releases](https://github.com/ltdthanhdat/xteink-sync/releases)

## Why Xteink Sync

Xteink Sync is built for a simple workflow:

1. scan local and remote
2. preview the sync plan
3. execute only after review
4. inspect the run later in history

That keeps sync decisions visible instead of hiding them behind a blind push/pull flow.

## Features

- Preview the sync plan before execution
- Sync files between a local folder and a CrossPoint device
- Support `bidirectional`, `pull-only`, and `push-only` modes
- Surface conflicts separately from safe transfers
- Store sync history for later review
- Persist sync state to make future runs safer

## Download

### Prerequisites

- A device running CrossPoint firmware
- `~/.local/bin` available in `PATH`
- `curl` or `wget`

### Linux and macOS

```bash
curl -fsSL https://github.com/ltdthanhdat/xteink-sync/releases/latest/download/install-release.sh | sh
```

Or:

```bash
wget -qO- https://github.com/ltdthanhdat/xteink-sync/releases/latest/download/install-release.sh | sh
```

Install a specific version:

```bash
curl -fsSL https://github.com/ltdthanhdat/xteink-sync/releases/latest/download/install-release.sh | VERSION=v0.1.4 sh
```

Run:

```bash
xteink-sync
```

Release page:

```text
https://github.com/ltdthanhdat/xteink-sync/releases/latest
```

### Windows

Download `xteink-sync-windows-x64.zip` from the latest release page, extract it, and run `xteink-sync.exe`.

### Release Assets

Each release includes:

- prebuilt binaries for supported platforms
- a ready-to-run install script for Unix-like systems
- `install-release.sh`
- `xteink-sync-linux-x64.tar.gz`
- `xteink-sync-macos-arm64.tar.gz`
- `xteink-sync-windows-x64.zip`

Prebuilt assets are published automatically from GitHub Actions on each version tag.

### Manual Install

If you prefer to install manually, download the asset that matches your platform from the release page, extract it, and move `xteink-sync` into `~/.local/bin`.

### Uninstall

```bash
rm -f ~/.local/bin/xteink-sync
```

## Quick Start

1. Launch `xteink-sync`
2. Configure the device URL, local root, and sync mode
3. Let the app scan both sides
4. Review the generated sync plan
5. Execute the sync if the plan looks correct
6. Revisit the result from sync history

## Typical Workflow

### 1. Open the settings screen

Choose the device URL, local root, and sync mode.

<!-- Insert screenshot here. Recommended path: docs/images/step-1-settings.png -->
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/2f8240b6-0b4e-454f-92db-8af6f0bcba1e" />


### 2. Start a scan

The app validates the local root, connects to the device, scans both sides, and builds a sync plan.

<!-- Insert screenshot here. Recommended path: docs/images/step-2-scan.png -->
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/4227fe37-59fa-46f7-ba74-ef3ee0562100" />

### 3. Review the plan

Inspect uploads, downloads, deletes, conflicts, and skipped items before execution.

<!-- Insert screenshot here. Recommended path: docs/images/step-3-preview.png -->
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/ddffadff-bd2c-4233-a8ee-d8822f9411ed" />

### 4. Execute the sync

Run the planned actions and monitor execution progress in the TUI.

<!-- Insert screenshot here. Recommended path: docs/images/step-4-execute.png -->
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/f5c016ab-ebb5-4ade-998f-5ef9f495936f" />

## Sync Modes

- `bidirectional`: sync both sides and surface conflicts when both changed
- `pull-only`: prefer the device as the source of truth
- `push-only`: prefer the local folder as the source of truth

## Notes

- This project is intended for CrossPoint firmware devices only.
- Sync state is stored in `.xteink-sync/state.db` under the current working directory.
- The release installer currently supports Linux and macOS. Windows uses the `.zip` asset.
