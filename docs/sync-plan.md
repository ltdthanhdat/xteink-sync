# Kế Hoạch Sync Xteink

Tài liệu này là điểm vào chính để hiểu dự án và dẫn sang các file chi tiết hơn.

## Mục Tiêu

Xây một ứng dụng TUI chạy cục bộ để đồng bộ thư mục giữa:

- máy local
- thiết bị Xteink X4 qua HTTP API của file manager

Ứng dụng không dùng browser automation cho runtime chính. Luồng sync đi qua các HTTP endpoint thật của thiết bị.

## Kiến Trúc Chốt Hiện Tại

Hệ thống được chia thành 4 phần:

1. `device adapter`
   - bọc HTTP API của thiết bị
   - scan tree, upload, download, mkdir, move, rename

2. `sync engine`
   - so sánh `local`, `remote`, và `baseline`
   - tạo plan với `upload`, `download`, `conflict`, `delete`, `delete-candidate`
   - thực thi action theo thứ tự an toàn

3. `state store`
   - lưu `profiles`, `baseline entries`, `tombstones`, và `runs` trong `SQLite`

4. `TUI app`
   - nhập `base URL`, `local root`, `remote root`, và `mode`
   - preview plan
   - execute sync
   - xem history

## Quyết Định Quan Trọng

- Runtime hiện tại ưu tiên một profile mặc định; profile management vẫn còn trong code nhưng đang tắt bằng feature flag.
- Delete được propagate bằng hard delete, nhưng vẫn giữ `tombstone` để replay/recovery khi run fail giữa chừng.
- Scanner vẫn bỏ qua folder legacy `.xteink-trash` để tránh sync nhầm dữ liệu rác cũ.
- `bidirectional` không có authoritative side mặc định; mọi quyết định delete phải đi qua `baseline`.
- `same-size ambiguous` ở remote phải dùng `hash-on-demand`, không được mặc định là unchanged.

## Tài Liệu Liên Quan

- Trạng thái code hiện tại: [current-state.md](./current-state.md)
- Luồng sync và delete policy: [sync-flow.md](./sync-flow.md)
- Hướng triển khai tiếp: [next-steps.md](./next-steps.md)

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
- retry/resume cho lỗi mạng chưa làm
- progress hiện mới ở mức action-level, chưa có byte-level

## Mục Tiêu MVP

MVP được coi là đủ dùng khi:

- nhập và validate được URL thiết bị
- scan được cây local và remote
- preview được sync plan an toàn
- execute được `upload`, `download`, `conflict resolution tối thiểu`, và `delete`
- lưu được baseline và tombstone state đúng
- có history cơ bản trong TUI
