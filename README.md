# Xteink Sync

File sync for local machines and Xteink devices running CrossPoint firmware, with sync plan preview and sync history.

> CrossPoint firmware only.

![Bun](https://img.shields.io/badge/Bun-1.3+-000000?logo=bun&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-20232A?logo=react)
![Ink](https://img.shields.io/badge/Ink-TUI-111111)
![SQLite](https://img.shields.io/badge/SQLite-State-003B57?logo=sqlite&logoColor=white)
![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)
![Release](https://img.shields.io/badge/Release-Automated-2EA44F?logo=github&logoColor=white)

Installation • Quick Start • Screenshots • Documentation

<!-- Insert hero screenshot here. Recommended path: docs/images/hero.png -->
_Hero screenshot placeholder_

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

## Installation

### Prerequisites

- A device running CrossPoint firmware
- `~/.local/bin` available in `PATH`

### Install from Releases

```bash
wget <release-asset-url>
tar -xzf xteink-sync-linux-x64.tar.gz
mkdir -p ~/.local/bin
mv xteink-sync ~/.local/bin/
```

Then run:

```bash
xteink-sync
```

Prebuilt assets are published automatically from GitHub Actions on each release tag.

### Available Release Assets

- `xteink-sync-linux-x64.tar.gz`
- `xteink-sync-macos-x64.tar.gz`
- `xteink-sync-macos-arm64.tar.gz`
- `xteink-sync-windows-x64.zip`

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

## Screenshots

### Settings

<!-- Insert screenshot here. Recommended path: docs/images/settings.png -->
_Screenshot placeholder_

### Plan Preview

<!-- Insert screenshot here. Recommended path: docs/images/plan-preview.png -->
_Screenshot placeholder_

### Execution Progress

<!-- Insert screenshot here. Recommended path: docs/images/execution-progress.png -->
_Screenshot placeholder_

### Sync History

<!-- Insert screenshot here. Recommended path: docs/images/sync-history.png -->
_Screenshot placeholder_

## Typical Workflow

### 1. Open the settings screen

Choose the device URL, local root, and sync mode.

<!-- Insert screenshot here. Recommended path: docs/images/step-1-settings.png -->
_Screenshot placeholder_

### 2. Start a scan

The app validates the local root, connects to the device, scans both sides, and builds a sync plan.

<!-- Insert screenshot here. Recommended path: docs/images/step-2-scan.png -->
_Screenshot placeholder_

### 3. Review the plan

Inspect uploads, downloads, deletes, conflicts, and skipped items before execution.

<!-- Insert screenshot here. Recommended path: docs/images/step-3-preview.png -->
_Screenshot placeholder_

### 4. Execute the sync

Run the planned actions and monitor execution progress in the TUI.

<!-- Insert screenshot here. Recommended path: docs/images/step-4-execute.png -->
_Screenshot placeholder_

### 5. Check sync history

Review previous runs and inspect summaries afterward.

<!-- Insert screenshot here. Recommended path: docs/images/step-5-history.png -->
_Screenshot placeholder_

## Sync Modes

- `bidirectional`: sync both sides and surface conflicts when both changed
- `pull-only`: prefer the device as the source of truth
- `push-only`: prefer the local folder as the source of truth

## Notes

- This project is intended for CrossPoint firmware devices only.
- Sync state is stored in `.xteink-sync/state.db` under the current working directory.
- Release binaries are built automatically by GitHub Actions.

## Development

If you are working on the project locally:

```bash
bun install
bun test src
bun run build
```

## Documentation

- Current implementation status: [docs/current-state.md](docs/current-state.md)
- Follow-up work and gaps: [docs/next-steps.md](docs/next-steps.md)
- Sync behavior details: [docs/sync-flow.md](docs/sync-flow.md)
- Project plan: [docs/sync-plan.md](docs/sync-plan.md)
