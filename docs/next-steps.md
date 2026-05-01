# Next Steps

Tài liệu này gom các hướng triển khai tiếp theo theo mức ưu tiên.

## Ưu Tiên 1: Siết Executor Và Recovery

### 1. Retry ngắn cho network action

Mục tiêu:

- retry `download`, `upload`, `remote-soft-delete` khi lỗi mạng ngắn
- không retry mù cho lỗi logic như `404`, `400`

Gợi ý triển khai:

- thêm wrapper retry ở `device adapter`
- retry 2-3 lần với backoff ngắn
- chỉ áp dụng cho lỗi network hoặc `5xx`

### 2. Run failure recovery

Mục tiêu:

- nếu run fail giữa chừng, lần sau resume sạch hơn
- không resurrect file sai vì pending tombstone chưa resolve

Gợi ý:

- giữ tombstone `pending` nếu delete chưa xong
- cân nhắc lưu execution log ngắn theo action trong `sync_runs`

### 3. Byte-level progress

Hiện tại progress mới ở mức action.

Hướng tiếp:

- hiện size file đang xử lý
- hiện byte progress cho download/upload lớn nếu adapter hỗ trợ stream

## Ưu Tiên 2: Làm Rõ Review Và UX

### 1. Review riêng cho `delete-candidate`

Hiện tại `delete-candidate` chỉ hiện trong summary/action list.

Nên thêm:

- màn hoặc toggle riêng cho delete candidates
- giải thích rõ vì sao chưa auto delete
- gợi ý user chuyển mode hoặc resolve thủ công

### 2. Giữ baseline chỉ auto-update

Rule runtime nên giữ như hiện tại:

- không cho seed baseline thủ công từ màn preview
- baseline chỉ auto update sau execute an toàn
- nếu còn `conflict` hoặc `delete-candidate` thì không update baseline tự động

### 3. Tách progress view và preview view

Hiện `executing` còn khá thô.

Nên thêm:

- counter theo loại action
- log ngắn 5 action gần nhất
- trạng thái cuối rõ hơn khi fail

## Ưu Tiên 3: Nâng Chất Lõi Sync

### 1. Rename / move detection

Đây là gap lớn nhất của sync engine hiện tại.

Vấn đề:

- rename dễ bị hiểu thành delete + create
- move cũng vậy

Hướng đơn giản:

- detect candidate rename khi:
  - cùng hash
  - path cũ mất
  - path mới xuất hiện

Chưa cần auto execute rename ngay; có thể preview trước.

### 2. Trash cleanup policy

Hiện `.xteink-trash` sẽ tăng dần.

Cần chốt:

- giữ bao lâu
- cleanup thủ công hay tự động
- cleanup local và remote cùng policy hay khác nhau

### 3. Executor integration tests

Hiện mới có planner tests.

Nên thêm:

- test local soft delete
- test tombstone replay
- test baseline chỉ update khi an toàn

## Ưu Tiên 4: Mở Rộng Sản Phẩm

### 1. Bật lại profile management

Khi runtime một profile đã ổn hơn:

- bật lại feature flag
- giữ single-profile path làm default UX

### 2. Watch mode / polling

Sau khi sync thủ công đủ chắc:

- local watch bằng `chokidar`
- remote poll theo chu kỳ

### 3. WebSocket upload path

Chỉ cần nếu:

- HTTP upload chậm
- hoặc firmware yêu cầu WS path ổn định hơn

## Thứ Tự Làm Đề Xuất

1. thêm review riêng cho `delete-candidate`
2. thêm retry ngắn cho network actions
3. thêm executor integration tests
4. thiết kế rename/move detection
5. chốt trash cleanup policy

## Done Criteria Cho Vòng Tiếp Theo

Vòng triển khai tiếp theo nên được coi là xong khi:

- delete flow có review rõ hơn
- run fail giữa chừng đỡ mong manh hơn
- có thêm test cho executor
- tài liệu vẫn khớp với code sau khi đổi
