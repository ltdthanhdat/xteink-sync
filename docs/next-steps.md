# Next Steps

This document groups likely follow-up work by priority.

## Priority 1: Tighten Executor And Recovery

### 1. Short retry for network actions

Goals:

- retry `download`, `upload`, and `remote-delete` on short-lived network failures
- do not blindly retry logic errors such as `404` or `400`

Suggested implementation:

- add a retry wrapper in the `device adapter`
- retry 2-3 times with short backoff
- apply only to network errors or `5xx`

### 2. Run failure recovery

Goals:

- make the next run recover more cleanly after a mid-run failure
- avoid resurrecting the wrong files because pending tombstones were not resolved

Suggestions:

- keep tombstones `pending` if delete did not finish
- consider storing a short per-action execution log in `sync_runs`

### 3. Byte-level progress

Progress is currently only action-level.

Next direction:

- show the size of the file being processed
- show byte progress for large downloads/uploads if the adapter supports streaming

## Priority 2: Improve Review And UX Clarity

### 1. Dedicated review for `delete-candidate`

Right now, `delete-candidate` only appears in the summary/action list.

Should add:

- a dedicated screen or toggle for delete candidates
- a clear explanation of why auto-delete did not happen
- guidance for switching mode or resolving manually

### 2. Keep baseline as auto-update only

The runtime rule should stay as it is:

- do not allow manual baseline seeding from the preview screen
- only auto-update baseline after a safe execution
- if `conflict` or `delete-candidate` remains, do not update baseline automatically

### 3. Separate progress view and preview view

The current `executing` view is still fairly rough.

Should add:

- counters by action type
- a short log of the last 5 actions
- a clearer final state on failure

## Priority 3: Improve The Sync Core

### 1. Rename / move detection

This is the biggest gap in the current sync engine.

Problem:

- a rename can easily be interpreted as delete + create
- a move has the same issue

Simple direction:

- detect candidate renames when:
  - the hash matches
  - the old path disappeared
  - the new path appeared

No need to auto-execute rename immediately; preview-first is acceptable.

### 2. Legacy trash cleanup

If older environments previously created `.xteink-trash` or `xteink-trash`, decide:

- whether to clean it up once during migration
- whether cleanup is manual or gets a dedicated cleanup command
- whether the UI/docs should warn about it more explicitly

### 3. Executor integration tests

Right now there are only planner tests.

Should add:

- local delete tests
- tombstone replay tests
- tests that baseline only updates when the result is safe

## Priority 4: Expand The Product

### 1. Re-enable profile management

Once the single-profile runtime path is more stable:

- turn the feature flag back on
- keep the single-profile path as the default UX

### 2. Watch mode / polling

After manual sync becomes solid enough:

- local watch via `chokidar`
- remote polling on an interval

### 3. WebSocket upload path

Only needed if:

- HTTP upload is too slow
- or firmware requires a more stable WS upload path

## Recommended Execution Order

1. add dedicated review for `delete-candidate`
2. add short retry for network actions
3. add executor integration tests
4. design rename/move detection
5. decide the legacy trash cleanup policy

## Done Criteria For The Next Iteration

The next implementation round should be considered done when:

- the delete flow has clearer review UX
- mid-run failures are less fragile
- executor coverage has improved
- documentation still matches the code after the changes
