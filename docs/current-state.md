# Trạng Thái Hiện Tại

Tài liệu này mô tả trạng thái implementation hiện tại của codebase.

## Stack

- `Bun`
- `TypeScript`
- `Ink`
- `React`
- `SQLite` qua `bun:sqlite`

## Runtime Flow Hiện Tại

Ứng dụng hiện chạy theo flow:

1. nhập `base URL`
2. nhập `local root`
3. nhập `remote root`
4. chọn mode:
   - `bidirectional`
   - `pull-only`
   - `push-only`
5. scan local + remote
6. đọc `baseline` + `pending tombstones`
7. preview plan
8. execute khi người dùng xác nhận

## Những Gì Đã Có

### Device Adapter

- probe `/files`
- scan remote tree qua `/api/files`
- download file
- upload file
- `mkdir`
- `rename`
- `move`
- `delete` remote qua `POST /delete`

### Sync Engine

- first-run heuristics
- 3-way diff:
  - `local`
  - `remote`
  - `baseline`
- `hash-on-demand` cho case same-size ambiguous ở remote
- planner cho:
  - `upload`
  - `download`
  - `conflict`
  - `skip`
  - `local-delete`
  - `remote-delete`
  - `delete-candidate`
- conflict resolution tối thiểu:
  - giữ local ở path gốc
  - lưu remote thành `conflict-remote-*`
  - upload cả hai bản lên remote

### State Store

Các bảng hiện có:

- `sync_profiles`
- `sync_entries`
- `sync_tombstones`
- `sync_runs`

State hiện lưu:

- baseline file-level:
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

- nhập config
- preview plan
- execute
- history
- run detail
- progress action-level khi execute:
  - tổng action
  - action đang chạy
  - action vừa xong
  - lỗi hiện tại nếu fail

## Feature Flags

Hiện đang có:

- `enableProfileManagement = false`

Điều đó có nghĩa là:

- code profile picker vẫn còn
- runtime mặc định đang dùng một profile cố định

## Verify Đã Có

- `bun test src`
- `bun run build`

## Điểm Chưa Ổn Hoặc Chưa Làm

- chưa có rename detection thật sự
- chưa có retry/resume khi lỗi mạng
- chưa có byte-level progress
- chưa có review riêng cho `delete-candidate`
- chưa có test integration cho executor
- chưa có cleanup cho folder trash legacy nếu trước đây đã tạo ra
