# Sync Flow

This document defines the current planner/executor flow and delete policy.

## Overall Flow

```text
config
-> validate device
-> scan local
-> scan remote
-> load baseline
-> load pending tombstones
-> build plan
-> preview
-> execute
-> update baseline if the final state is safe
-> record run
```

## Planner Inputs

For each path, the planner looks at 4 sources:

- `local`
- `remote`
- `baseline`
- `pending tombstone`

## Planner Outputs

The planner can currently produce these actions:

- `upload`
- `download`
- `conflict`
- `skip`
- `local-delete`
- `remote-delete`
- `delete-candidate`

## First Run Rule

If no `baseline` exists yet:

- a missing file must not be treated as a delete
- only handle:
  - local-only
  - remote-only
  - same-path-on-both-sides

## Hash Rule

If `baseline.size == remote.size`:

- remote is not guaranteed to be unchanged
- the engine must `downloadBytes()` and do `hash-on-demand` before skipping

## Bidirectional Rule

### Update

- only local changed -> `upload`
- only remote changed -> `download`
- both changed -> `conflict`

### Delete

If the path exists in baseline:

- local missing, remote still matches baseline
  - create `remote-delete`
  - tombstone side = `local`

- remote missing, local still matches baseline
  - create `local-delete`
  - tombstone side = `remote`

- one side is missing but the other side also changed
  - `delete vs modify conflict`

## Push-only Rule

- local is the authoritative side for create/update/delete
- remote drift may be overwritten or deleted depending on the case

Main cases:

- local changed, remote unchanged -> `upload`
- local missing, remote still in baseline -> `remote-delete`
- local still in baseline, remote missing -> `upload`

## Pull-only Rule

- remote is the authoritative side for create/update/delete

Main cases:

- remote changed, local unchanged -> `download`
- remote missing, local still in baseline -> `local-delete`
- remote still in baseline, local missing -> `download`

## Tombstone Rule

Tombstones are used to remember:

- which path was intentionally deleted
- which side initiated the delete
- whether that delete has finished propagating

A tombstone should only be marked `resolved` when:

- the delete action finished
- the original path has converged

## Convergence

A path is considered converged when:

- the required action has finished
- no unresolved conflict remains
- the final logical state of local and remote is consistent

Examples:

- both sides still have the same file
- or both sides no longer have the original path after delete propagation

## Delete Rule

Current implementation:

- local delete:
  - remove the file at the original path with hard delete

- remote delete:
  - call `POST /delete` for the original path on the device

- tombstones are still kept so unfinished delete propagation can be replayed
- the scanner still ignores legacy `.xteink-trash` and `xteink-trash` folders if they still exist

## Execute Rule

The executor runs these actions sequentially:

- `download`
- `upload`
- `local-delete`
- `remote-delete`
- `conflict`

It does not execute:

- `skip`
- `delete-candidate`

## Baseline Update Rule

Only auto-update baseline when:

- execution finished
- no `conflict` remains
- no `delete-candidate` remains

If unresolved state still exists:

- only record the run
- do not update baseline automatically
