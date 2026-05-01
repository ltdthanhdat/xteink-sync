# Current State

This document describes the current implementation status of the codebase.

## Stack

- `Bun`
- `TypeScript`
- `Ink`
- `React`
- `SQLite` via `bun:sqlite`

## Current Runtime Flow

The application currently runs with this flow:

1. enter the `base URL`
2. enter the `local root`
3. enter the `remote root`
4. choose a mode:
   - `bidirectional`
   - `pull-only`
   - `push-only`
5. scan local and remote
6. read `baseline` and `pending tombstones`
7. preview the plan
8. execute after user confirmation

## What Already Exists

### Device Adapter

- probe `/files`
- scan the remote tree through `/api/files`
- download files
- upload files
- `mkdir`
- `rename`
- `move`
- remote `delete` through `POST /delete`

### Sync Engine

- first-run heuristics
- 3-way diff across:
  - `local`
  - `remote`
  - `baseline`
- `hash-on-demand` for same-size ambiguous cases on remote
- planner support for:
  - `upload`
  - `download`
  - `conflict`
  - `skip`
  - `local-delete`
  - `remote-delete`
  - `delete-candidate`
- minimal conflict resolution:
  - keep the local file at the original path
  - save the remote file as `conflict-remote-*`
  - upload both copies back to remote

### State Store

Current tables:

- `sync_profiles`
- `sync_entries`
- `sync_tombstones`
- `sync_runs`

Currently stored state:

- baseline at file level:
  - `relative_path`
  - `size`
  - `hash`
- tombstone:
  - `relative_path`
  - `deleted_on`
  - `status`
  - `created_at`
  - `resolved_at`

### TUI

- configuration input
- plan preview
- execute
- history
- run detail
- action-level execution progress:
  - total action count
  - current action
  - last completed action
  - current error on failure

## Feature Flags

Current flags:

- `enableProfileManagement = false`

This means:

- the profile picker code still exists
- runtime currently defaults to a single fixed profile

## Existing Verification

- `bun test src`
- `bun run build`
- `make build`
- `make` targets resolve Bun from either `PATH` or `~/.bun/bin/bun`
- GitHub Actions CI runs install, test, and build on `master` and pull requests
- GitHub Actions release workflow builds precompiled release assets on version tags
- Releases also publish a Unix install script for quick `curl`/`wget` installation

## Known Gaps Or Incomplete Areas

- no real rename detection yet
- no retry/resume for network failures yet
- no byte-level progress yet
- no dedicated review flow for `delete-candidate`
- no executor integration tests yet
- no cleanup flow for legacy trash folders created by older behavior
