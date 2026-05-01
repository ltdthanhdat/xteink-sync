# Luồng Sync

Tài liệu này chốt luồng planner/executor hiện tại và delete policy.

## Luồng Tổng Quát

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
-> update baseline nếu trạng thái cuối an toàn
-> record run
```

## Planner Inputs

Với mỗi path, planner nhìn 4 nguồn:

- `local`
- `remote`
- `baseline`
- `pending tombstone`

## Planner Outputs

Planner hiện có thể tạo các action:

- `upload`
- `download`
- `conflict`
- `skip`
- `local-soft-delete`
- `remote-soft-delete`
- `delete-candidate`

## First Run Rule

Nếu chưa có `baseline`:

- không được coi missing file là delete
- chỉ xử lý như:
  - local-only
  - remote-only
  - same-path-both-side

## Hash Rule

Nếu `baseline.size == remote.size`:

- remote chưa chắc unchanged
- engine phải `downloadBytes()` và `hash-on-demand` trước khi bỏ qua

## Bidirectional Rule

### Update

- chỉ local changed -> `upload`
- chỉ remote changed -> `download`
- cả hai changed -> `conflict`

### Delete

Nếu path có trong baseline:

- local missing, remote vẫn đúng baseline
  - tạo `remote-soft-delete`
  - tombstone side = `local`

- remote missing, local vẫn đúng baseline
  - tạo `local-soft-delete`
  - tombstone side = `remote`

- một bên missing nhưng bên còn lại cũng changed
  - `delete vs modify conflict`

## Push-only Rule

- local là authoritative side cho create/update/delete
- remote drift có thể bị overwrite hoặc soft-delete tùy case

Cases chính:

- local changed, remote unchanged -> `upload`
- local missing, remote còn baseline -> `remote-soft-delete`
- local còn baseline, remote missing -> `upload`

## Pull-only Rule

- remote là authoritative side cho create/update/delete

Cases chính:

- remote changed, local unchanged -> `download`
- remote missing, local còn baseline -> `local-soft-delete`
- remote còn baseline, local missing -> `download`

## Tombstone Rule

Tombstone dùng để nhớ:

- path nào đã bị xóa có chủ đích
- xóa từ phía nào
- delete đó đã propagate xong chưa

Tombstone chỉ nên được `resolved` khi:

- action delete đã chạy xong
- path gốc đã hội tụ

## Hội Tụ

Một path được coi là hội tụ khi:

- action cần thiết đã chạy xong
- không còn conflict chưa resolve
- trạng thái logic cuối của local và remote đã thống nhất

Ví dụ:

- cả hai cùng có file giống nhau
- hoặc cả hai cùng không còn file ở path gốc sau soft-delete

## Soft Delete Rule

Không hard delete ngay.

Implementation hiện tại:

- local soft delete:
  - move file vào `.xteink-trash/...`
  - đổi tên thành `*.deleted-<timestamp>`

- remote soft delete:
  - move file vào `.xteink-trash/...`
  - rename thành `*.deleted-<timestamp>`

Scanner local và remote đều phải bỏ qua `.xteink-trash`.

## Execute Rule

Executor chạy lần lượt từng action:

- `download`
- `upload`
- `local-soft-delete`
- `remote-soft-delete`
- `conflict`

Không execute:

- `skip`
- `delete-candidate`

## Baseline Update Rule

Chỉ auto update baseline khi:

- execute xong
- không còn `conflict`
- không còn `delete-candidate`

Nếu còn unresolved state:

- chỉ record run
- không update baseline tự động
