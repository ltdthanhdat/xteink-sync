# Xteink Sync Plan

This document is the main entry point for understanding the project and linking to more detailed files.

## Goal

Build a local TUI application that syncs folders between:

- a local machine
- an Xteink X4 device through the file manager HTTP API

The application does not use browser automation for the main runtime flow. Sync runs through the device's real HTTP endpoints.

## Current Architecture

The system is divided into 4 parts:

1. `device adapter`
   - wraps the device HTTP API
   - scans the tree, uploads, downloads, creates directories, moves, and renames

2. `sync engine`
   - compares `local`, `remote`, and `baseline`
   - creates a plan with `upload`, `download`, `conflict`, `delete`, and `delete-candidate`
   - executes actions in a safe order

3. `state store`
   - stores `profiles`, `baseline entries`, `tombstones`, and `runs` in `SQLite`

4. `TUI app`
   - captures `base URL`, `local root`, `remote root`, and `mode`
   - previews the plan
   - executes sync
   - shows history

## Important Decisions

- Runtime currently favors a default single-profile flow; profile management still exists in code but is disabled by feature flag.
- Deletes are propagated with hard delete, while `tombstone` records are still kept for replay/recovery after mid-run failures.
- The scanner still ignores legacy `.xteink-trash` folders to avoid syncing old trash data by accident.
- `bidirectional` mode has no default authoritative side; every delete decision must go through `baseline`.
- Same-size ambiguous remote cases must use `hash-on-demand` and must not be assumed unchanged.

## Related Documents

- Current code status: [current-state.md](./current-state.md)
- Sync flow and delete policy: [sync-flow.md](./sync-flow.md)
- Follow-up implementation directions: [next-steps.md](./next-steps.md)

## Confirmed API

- `GET /api/files?path=<path>`
- `GET /download?path=<path>`
- `POST /upload?path=<dir>`
- `POST /mkdir`
- `POST /rename`
- `POST /move`
- `POST /delete`
- `WS ws://<host>:81/` for the UI upload path, not yet used in the MVP

## Unresolved Limitations

- remote has no `mtime`
- remote has no checksum metadata
- rename/move detection is not implemented yet
- retry/resume for network errors is not implemented yet
- progress is only action-level for now, not byte-level

## MVP Goal

The MVP should be considered good enough when it can:

- input and validate the device URL
- scan local and remote trees
- preview a safe sync plan
- execute `upload`, `download`, minimal conflict resolution, and `delete`
- store baseline and tombstone state correctly
- provide basic TUI history
