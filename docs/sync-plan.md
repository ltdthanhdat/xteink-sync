# Xteink Sync Plan

Tài liệu này là điểm vào chính để hiểu dự án và dẫn sang các file chi tiết hơn.

## Mục Tiêu

Xây một ứng dụng TUI chạy cục bộ để đồng bộ thư mục giữa:

- máy local
- thiết bị Xteink X4 qua HTTP API của file manager

Ứng dụng không dùng browser automation cho runtime chính. Phần đồng bộ đi qua HTTP endpoints thật của thiết bị.

## Kiến Trúc Chốt Hiện Tại

Hệ thống được chia thành 4 phần:

1. `device adapter`
   - bọc HTTP API của thiết bị
   - scan tree, upload, download, mkdir, move, rename

2. `sync engine`
   - so sánh `local`, `remote`, `baseline`
   - tạo plan `upload`, `download`, `conflict`, `soft-delete`, `delete-candidate`
   - thực thi action theo thứ tự an toàn

3. `state store`
   - lưu `profiles`, `baseline entries`, `tombstones`, `runs` trong `SQLite`

4. `TUI app`
   - nhập `base URL`, `local root`, `remote root`, `mode`
   - preview plan
   - execute sync
   - xem history

## Quyết Định Quan Trọng

- Runtime hiện tại ưu tiên một profile mặc định; profile management vẫn còn trong code nhưng đang tắt bằng feature flag.
- `soft delete` không xóa thẳng; file được chuyển vào `.xteink-trash`.
- scanner bỏ qua `.xteink-trash` để tránh file đã xóa quay lại plan.
- `bidirectional` không có authoritative side mặc định; mọi quyết định delete phải đi qua `baseline`.
- `same-size ambiguous` ở remote phải `hash-on-demand`, không được mặc định là unchanged.

## Tài Liệu Liên Quan

- Trạng thái code hiện tại: [current-state.md](/home/datlt/workspace/xteink-sync/docs/current-state.md)
- Luồng sync và delete policy: [sync-flow.md](/home/datlt/workspace/xteink-sync/docs/sync-flow.md)
- Hướng triển khai tiếp: [next-steps.md](/home/datlt/workspace/xteink-sync/docs/next-steps.md)

## API Đã Xác Nhận

- `GET /api/files?path=<path>`
- `GET /download?path=<path>`
- `POST /upload?path=<dir>`
- `POST /mkdir`
- `POST /rename`
- `POST /move`
- `POST /delete`
- `WS ws://<host>:81/` cho upload của UI, nhưng chưa dùng trong MVP

## Giới Hạn Chưa Giải

- remote không có `mtime`
- remote không có checksum metadata
- rename/move detection chưa làm
- retry/resume cho network lỗi chưa làm
- progress hiện mới ở mức action-level, chưa có byte-level

## Mục Tiêu MVP

MVP được coi là đủ dùng khi:

- nhập URL thiết bị và validate được
- scan được local và remote
- preview được sync plan an toàn
- execute được `upload`, `download`, `conflict resolution tối thiểu`, `soft delete`
- lưu được baseline và tombstone đúng
- có history cơ bản trong TUI
