# Kế Hoạch Đồng Bộ Cục Bộ Xteink X4

## Mục Tiêu

Xây dựng một ứng dụng chạy cục bộ có thể đồng bộ thư mục hai chiều giữa thiết bị Xteink X4 và máy hiện tại.

Hiện tại thiết bị có một trình quản lý tệp qua web tại địa chỉ dạng:

- `http://192.168.1.34/files`

Điều này có nghĩa là cách tiếp cận thực tế nhất không phải là tự động hóa trình duyệt cho người dùng cuối, mà là một sync agent cục bộ giao tiếp trực tiếp với các HTTP endpoint phía dưới của thiết bị.

## Cách Tiếp Cận Đề Xuất

Xem Xteink X4 như một hệ thống tệp từ xa qua HTTP.

Xây dựng giải pháp theo ba lớp:

1. `device adapter`
   - Phân tích ngược các endpoint của file manager nằm sau web UI.
   - Cung cấp các thao tác giống filesystem:
     - `list_dir(path)`
     - `download_file(remote_path, local_path)`
     - `upload_file(local_path, remote_dir)`
     - `mkdir(path)`
     - `delete(path)`
     - `rename(path, new_name)`
     - `move(path, dest_dir)`

2. `sync engine`
   - Quét tệp cục bộ.
   - Quét tệp từ xa từ thiết bị.
   - Lưu trạng thái đồng bộ trong `SQLite`.
   - So sánh `local`, `remote` và `last_sync_state`.
   - Quyết định upload, download, bỏ qua hoặc đánh dấu xung đột.

3. `TUI app`
   - Chạy trong terminal bằng `vadimdemedes/ink`
   - Cho người dùng nhập `base URL`, chọn mode sync và xem tiến trình
   - Hiển thị diff summary, conflict, log lỗi và kết quả cuối mỗi lần chạy

## API Quan Sát Được

Web file manager hiện đã chạy trên các HTTP endpoint, nên ứng dụng đồng bộ nên dùng trực tiếp các endpoint này thay vì tự động hóa giao diện trình duyệt.

Các endpoint đã quan sát được từ trang và khi kiểm tra runtime:

- `GET /api/files?path=<path>`
  - trả về mảng JSON
  - các field hiện quan sát được:
    - `name`
    - `size`
    - `isDirectory`
    - `isEpub`
  - hành vi đã xác nhận:
    - danh sách thư mục gốc được lấy bằng `path=%2F`
    - có thể quét thư mục con bằng cách gọi đệ quy cùng endpoint này với path đã encode, ví dụ `path=%2Fbooks`
    - tên tệp Unicode và dấu cách hoạt động nếu `path` được URL-encode
    - path không tồn tại hiện trả `200` cùng `[]`, nên client không thể tự phân biệt `không tồn tại` với `rỗng` chỉ từ endpoint này
- `GET /download?path=<path>`
  - tải tệp xuống
  - các header đã quan sát được gồm:
    - `content-length`
    - `content-type`
    - `content-disposition`
  - hạn chế hiện tại đã quan sát được:
    - `content-disposition` có vẻ làm lỗi tên tệp non-ASCII, nên sync client nên coi path đã yêu cầu là tên chuẩn thay vì suy ra tên từ response header
- `POST /upload?path=<path>`
  - upload vào thư mục đích được chỉ ra bởi query param `path`
  - body là `multipart/form-data` với field `file`
  - UI hiện tại cho chọn nhiều tệp một lần rồi upload tuần tự từng tệp, mỗi request vẫn là một tệp
  - tên tệp đích phía remote hiện theo tên gốc của file được gửi, chưa thấy bằng chứng từ UI rằng có thể chỉ định trực tiếp `remote file path` khác tên
- `WS ws://<host>:81/`
  - UI thử upload qua WebSocket trước khi fallback sang HTTP
  - protocol đã quan sát được:
    - client gửi `START:<filename>:<size>:<path>`
    - server phản hồi các message như `READY`, `PROGRESS:<...>`, `DONE`, `ERROR:<...>`
    - dữ liệu file được gửi theo binary chunks
  - sync agent không bắt buộc phải dùng WebSocket cho MVP, nhưng đây là một phần của hành vi upload thực tế của thiết bị
- `POST /mkdir`
  - form data:
    - `name`
    - `path`
- `POST /delete`
  - body dạng form-urlencoded:
    - `paths=<json-array>`
- `POST /rename`
  - form data:
    - `path`
    - `name`
- `POST /move`
  - form data:
    - `path`
    - `dest`
  - `dest` hiện là thư mục đích, không phải full path mới của file

Hạn chế quan trọng đã phát hiện:

- `GET /api/files` hiện không cung cấp `mtime`, checksum hoặc metadata kiểu inode.
- `GET /download` hiện không trả `Last-Modified` trong response đã quan sát được.
- Hiện chưa thấy endpoint metadata riêng cho một path đơn lẻ theo kiểu `stat(path)`.

Điều này làm thay đổi thiết kế đồng bộ: việc phát hiện thay đổi phía remote không thể chỉ dựa vào timestamp.

## Vì Sao Chọn Cách Này

- Giao hàng nhanh hơn so với tự xây một giao thức đồng bộ từ đầu.
- Tin cậy hơn so với mô phỏng thao tác thủ công trên trình duyệt.
- Hỗ trợ logic đồng bộ tăng dần và có thể mở rộng cho resume.
- Có thể thêm UI về sau mà không phải thay lõi đồng bộ.

## Các Giai Đoạn Triển Khai

## Giai Đoạn 1: MVP Đồng Bộ Hai Chiều

Phạm vi:

- Đồng bộ hai chiều giữa `device` và `local`
- Chỉ kích hoạt thủ công
- Lưu sync state vào `SQLite`
- Thêm phát hiện xung đột ngay từ đầu
- Chưa bật propagate delete tự động trong `bidirectional` ở phiên bản đầu
- So sánh bằng `relative path + size` như tín hiệu vòng đầu
- Lưu content hash của các tệp đã đồng bộ trong sync state
- Dùng xác minh dựa trên hash cho các thay đổi remote không rõ ràng
- Không bỏ qua một tệp remote `same-size ambiguous` nếu chưa xác minh
- Có log cơ bản và tổng kết cho mỗi lần sync

Quy tắc xung đột:

- Chỉ local thay đổi: upload
- Chỉ remote thay đổi: download
- Cả hai bên cùng thay đổi kể từ lần sync trước: tạo xung đột thay vì ghi đè im lặng

Cách xử lý xung đột được đề xuất:

- Giữ lại cả hai bản
- Ở implementation hiện tại:
  - giữ bản local ở `path` gốc
  - lưu bản remote thành `filename.conflict-remote-<timestamp>`
  - upload cả conflict copy và bản local lên remote

Hàm ý triển khai:

- vì upload hiện không cho chỉ định trực tiếp remote file path mới, cách thực dụng hiện tại là chuẩn bị file conflict cục bộ với tên đích rồi upload file đó

Mục tiêu:

- Chứng minh rằng có thể quét toàn bộ cây thư mục remote và thực hiện đồng bộ hai chiều an toàn mà không ghi đè im lặng.

## Giai Đoạn 2: Hoàn Thiện Để Dùng Thực Tế

Phạm vi:

- Theo dõi thay đổi tệp cục bộ
- Poll remote mỗi `30-60s`
- Nhiều sync profile
- Mẫu loại trừ
- Tự động retry khi mất kết nối
- TUI nhiều màn hình hoàn chỉnh hơn cho profile, diff preview và lịch sử sync

## Stack Kỹ Thuật

Stack được đề xuất để giao nhanh:

- `Node.js`
- `TypeScript`
- `vadimdemedes/ink`
- `React`
- `undici` hoặc `fetch` built-in của Node
- `ws` nếu cần hỗ trợ đường upload WebSocket sau này
- `SQLite`
- `bun:sqlite`
- `chokidar`

Vì sao là `Node.js + TypeScript + Ink`:

- Phù hợp để xây một ứng dụng TUI có stateful UI ngay trong terminal
- `Ink` cho phép tổ chức UI theo component thay vì ghép chuỗi console thủ công
- TypeScript giúp giữ rõ contract giữa `device adapter`, `sync engine` và `TUI`
- Node xử lý tốt filesystem, stream file và event loop cho progress UI
- Có thể giữ một entrypoint đơn giản cho người dùng nội bộ

## Kế Hoạch Triển Khai Theo API Trước

Thiết bị đã dùng được qua HTTP call trực tiếp, nên phần triển khai nên bắt đầu bằng một typed client bao quanh các endpoint đã quan sát được.

Các method được đề xuất:

- `list_dir(path)`
- `download_file(path, target_path)`
- `upload_file(source_path, remote_dir)`
- `mkdir(path, name)`
- `delete_paths(paths)`
- `rename_path(path, new_name)`
- `move_path(path, dest_dir)`

Lưu ý về semantics cần bám sát API thật:

- `upload_file` hiện nhắm vào `remote_dir`, không phải full remote file path
- `move_path` hiện chỉ đổi thư mục chứa, không đổi tên
- nếu cần tạo tên conflict riêng ở remote, flow khả thi hiện tại là upload theo tên gốc rồi `rename`, hoặc chuẩn bị file local tạm với tên conflict trước khi upload
- `stat(path)` nếu cần trong code nên được xem là abstraction do client tự dựng từ parent listing, không phải capability gốc đã xác minh

Giao diện trình duyệt chỉ nên được dùng để debug, không phải cho logic sync production.

## Kiến Trúc Ứng Dụng TUI

Ứng dụng nên được tổ chức thành các lớp sau:

1. `device adapter`
   - Bao quanh HTTP API của thiết bị
   - Chuẩn hóa request/response, retry ngắn và error mapping

2. `sync engine`
   - Xây snapshot local, remote và state cũ
   - Tạo sync plan
   - Thực thi action an toàn
   - Chỉ cập nhật baseline state sau khi action thành công

3. `state store`
   - Lưu `profiles`, `entries`, `runs` trong `SQLite`
   - Cho phép TUI đọc lịch sử và trạng thái hiện tại

4. `TUI shell`
   - Dùng `Ink` để render màn hình và nhận input từ terminal
   - Điều phối `device adapter`, `sync engine` và `state store`

Các màn hình TUI ban đầu nên có:

- màn hình nhập `base URL` thiết bị
- màn hình cấu hình sync cho một profile mặc định
- màn hình xác nhận chế độ chạy như `pull-only`, `push-only`, `bidirectional`
- màn hình trạng thái chạy cơ bản, sau này có thể mở rộng thành progress chi tiết theo file
- màn hình summary sau khi chạy xong

## Mô Hình Dữ Liệu Cốt Lõi

Các bảng được đề xuất:

### `sync_profiles`

- `id`
- `name`
- `remote_root`
- `local_root`
- `mode`
- `created_at`
- `updated_at`

### Chính Sách Địa Chỉ Thiết Bị

IP của thiết bị có thể thay đổi theo mạng hoặc DHCP lease, nên ứng dụng cần yêu cầu nhập IP thiết bị hoặc base URL mỗi lần người dùng chạy sync.

Chính sách được đề xuất:

1. Yêu cầu nhập IP thiết bị hoặc base URL ở đầu mỗi lần chạy sync.
2. Xác thực địa chỉ đã nhập trước khi bắt đầu quét:
   - `GET /files` phải trả về trang file manager của CrossPoint Reader
   - `GET /api/files?path=%2F` phải trả về một JSON array có schema mong đợi
3. Nếu xác thực thất bại, dừng sớm và yêu cầu nhập lại địa chỉ đúng thay vì tự động dò tìm.

Khuyến nghị:

- Giữ UX ở trạng thái tường minh: người dùng tự chọn địa chỉ thiết bị cho từng lần sync.
- Không tự quét subnet nội bộ hoặc âm thầm dùng lại địa chỉ cũ trong phiên bản chạy được đầu tiên.

### `sync_entries`

- `profile_name`
- `relative_path`
- `size`
- `hash`
- `updated_at`

Ghi chú:

- implementation hiện tại dùng `sync_entries` như một baseline store tối giản theo file
- chưa lưu song song `last_*` và `current_*`
- nếu thêm `tombstone`, nên mở rộng dần từ model tối giản này thay vì thiết kế lại toàn bộ state store một lần

### `sync_runs`

- `id`
- `profile_name`
- `started_at`
- `finished_at`
- `status`
- `summary_json`

## Thuật Toán Đồng Bộ

Trong mỗi lần chạy:

1. Tải profile
2. Quét cây thư mục local
3. Quét cây thư mục remote
4. Tải `last_sync_state` từ `SQLite`
5. Xây kế hoạch diff
6. Thực thi các hành động theo thứ tự an toàn
7. Cập nhật sync state
8. Ghi tổng kết và log của lần chạy

Các quy tắc thực thi an toàn:

- Download/upload vào tệp tạm trước nếu có thể
- Chỉ rename sang đích cuối cùng sau khi thành công
- Không bao giờ ghi đè xung đột một cách im lặng
- Không coi thiếu file là delete nếu chưa có baseline
- Chỉ cập nhật baseline sau khi action thành công và trạng thái cuối cùng đã hội tụ an toàn

### Chiến Lược Diff Với Giới Hạn API Hiện Tại

Vì remote listing không cung cấp `mtime`, chiến lược diff an toàn nên hoạt động như sau:

1. Dùng `path + type + size` làm remote snapshot vòng đầu.
2. Dùng `path + size + mtime` làm local snapshot vòng đầu.
3. Nếu một tệp rõ ràng thay đổi do khác kích thước, đánh dấu là đã thay đổi.
4. Nếu phía remote trùng bộ `path + size` của lần sync trước, coi nó là `same-size ambiguous` cho đến khi được xác minh, thay vì mặc định là không đổi.
5. Nếu phía local thay đổi trong khi phía remote là `same-size ambiguous`, tải hoặc stream tệp remote và tính hash trước khi quyết định.
6. Nếu phía local có vẻ không đổi nhưng phía remote là `same-size ambiguous`, hash tệp remote trước khi bỏ qua.
7. So sánh trạng thái hiện tại quan sát được với mốc chuẩn của lần sync trước bằng fingerprint mạnh nhất hiện có cho từng phía.
8. Nếu cả fingerprint local và remote đều khác mốc chuẩn đã sync của chúng, đánh dấu xung đột.

Điều này có nghĩa là đồng bộ hai chiều vẫn khả thi, nhưng để đúng hoàn toàn thì cần `hash-on-demand`.

### Giới Hạn Rename Và Move Trong MVP

Những gì đã xác nhận từ UI hiện tại:

- file có thao tác `rename`, `move`, `delete`
- folder hiện chỉ thấy thao tác `delete` trên UI
- `move` nhận thư mục đích, còn `rename` là thao tác riêng

Hệ quả cho MVP:

- không nên giả định remote rename/move là capability path-level đầy đủ cho mọi loại item
- nếu muốn hỗ trợ rename detection đúng nghĩa trong sync engine, cần thiết kế riêng; nếu chưa làm, tài liệu và sản phẩm nên coi rename/move là ngoài phạm vi hội tụ đúng của MVP

## Chính Sách Đồng Bộ Thực Tế

Chính sách được đề xuất cho thiết bị này:

- Chế độ mặc định: sync thủ công
- Chế độ production đầu tiên: hai chiều với conflict an toàn, và delete theo hướng `soft delete`
- Chính sách xung đột: không bao giờ ghi đè im lặng
- Chính sách xác minh: chỉ hash tệp remote khi cần, nhưng không được bỏ qua một tệp remote `same-size ambiguous` nếu chưa xác minh
- `push-only`: local là phía authoritative cho create/update/delete
- `pull-only`: remote là phía authoritative cho create/update/delete
- `bidirectional`: không có bên nào là authoritative mặc định; phải so với baseline

Chính sách delete được đề xuất:

- không có baseline: không được coi missing file là delete
- `push-only`:
  - local mất file, remote vẫn còn file, path có trong baseline
  - coi là delete từ local
  - propagate bằng `soft delete` ở remote
- `pull-only`:
  - remote mất file, local vẫn còn file, path có trong baseline
  - coi là delete từ remote
  - propagate bằng `soft delete` ở local
- `bidirectional`:
  - nếu một bên mất file và bên còn lại vẫn đúng baseline
  - tạo `tombstone`, rồi propagate bằng `soft delete`
  - nếu một bên mất file nhưng bên còn lại cũng đã thay đổi so với baseline
  - coi là `delete vs modify conflict`, không auto delete

Khái niệm `tombstone`:

- là record trong state nói rằng một path đã bị xóa có chủ đích từ một phía
- dùng để tránh resurrect file khi sync fail giữa chừng
- chỉ nên được mark `resolved` khi delete đã propagate xong và hai bên đã hội tụ ở path gốc

Khái niệm `hội tụ`:

- local và remote đã về cùng một trạng thái logic cuối cùng cho path đó
- ví dụ cùng có nội dung mới giống nhau, hoặc cùng không còn file ở path gốc sau khi soft-delete

Vì sao chọn chính sách này:

- API remote đủ tốt cho truyền tệp.
- Metadata remote không đủ phong phú cho kiểu sync chỉ dựa trên timestamp với chi phí thấp.
- Hash mọi tệp remote ở mỗi lần chạy thì đúng nhưng quá tốn kém.
- `hash-on-demand` giúp an toàn hơn mà không làm mọi lần sync đều chậm.
- Sync state phải giữ cả mốc chuẩn đã sync và trạng thái hiện tại quan sát được, nếu không việc phát hiện xung đột sẽ không nhất quán.

## Luồng Vào Ứng Dụng

Điểm vào chính nên là một TUI app, ví dụ:

- `xteink-sync`

Trong TUI, các thao tác ban đầu nên gồm:

- nhập và validate `base URL`
- chọn mode `pull-only`, `push-only` hoặc `bidirectional`
- chạy sync và xem progress trực tiếp
- xem summary của lần chạy gần nhất

Ghi chú về implementation hiện tại:

- profile management đang được giữ lại trong code nhưng tắt bằng feature flag
- runtime hiện tại đi theo hướng một profile mặc định để giảm độ phức tạp UX ở vòng đầu

Nếu vẫn cần command phụ để debug nội bộ, chỉ nên giữ ít command trợ giúp như:

- `xteink-sync probe-remote`
- `xteink-sync verify-db`

## Rủi Ro

- API của thiết bị là undocumented và có thể thay đổi theo firmware.
- Remote listing hiện không cung cấp `mtime` hoặc checksum metadata.
- Các chỉnh sửa remote có cùng kích thước không thể bị phát hiện với chi phí thấp nếu không hash nội dung, nên một số tệp trông như không đổi vẫn cần xác minh.
- Endpoint upload/download có thể không giữ nguyên metadata.
- Semantics của upload hiện thiên về `upload vào thư mục với tên gốc của file`, nên các use case cần đặt tên đích chính xác phải ghép thêm `rename`.
- UI hiện dùng WebSocket upload trước rồi mới fallback HTTP; nếu firmware thay đổi behavior giữa hai đường này, client cần chọn rõ một đường được hỗ trợ.
- `GET /api/files` trả `200 []` với path không tồn tại làm cho việc validate remote kém chính xác hơn nếu client không đối chiếu với listing của thư mục cha.
- `content-disposition` hiện có vẻ encode sai tên tệp Unicode, nên xử lý tên tệp không nên phụ thuộc vào header này.
- Rename/move của folder chưa được xác nhận từ UI hiện tại.
- Xóa hai chiều vẫn có rủi ro cao nếu thiếu baseline, tombstone hoặc chỉ dùng hard delete.
- Tệp lớn hoặc Wi-Fi gián đoạn có thể cần logic retry và resume.

## Thứ Tự Công Việc Được Đề Xuất

1. Triển khai một `device_client` tối thiểu bao quanh HTTP API đã quan sát được.
2. Triển khai nhập địa chỉ thiết bị và validate cho từng lần chạy.
3. Dựng `TUI shell` tối thiểu bằng `Ink` để nhập URL, chọn mode và hiển thị trạng thái chạy.
4. Thêm sync state lưu bền bằng `SQLite`.
5. Triển khai hash-on-demand diff logic cho các tệp remote không rõ ràng.
6. Triển khai đồng bộ hai chiều an toàn với xung đột ngay trong phiên bản đầu tiên.
7. Thêm delete planner và tombstone/soft-delete flow.
8. Thêm watch mode, retry và các màn hình TUI hoàn chỉnh hơn sau.

## Tiêu Chí Hoàn Thành Cho MVP

Phiên bản khả dụng đầu tiên cần:

- kết nối được tới thiết bị bằng URL
- yêu cầu nhập IP thiết bị hoặc base URL mỗi lần trước khi sync bắt đầu
- đọc được một thư mục remote được chọn
- đồng bộ hai chiều giữa thư mục remote được chọn và thư mục local được chọn
- bỏ qua các tệp không đổi ở các lần chạy lặp lại
- tạo log cho các tệp thay đổi và các tệp thất bại
- phát hiện xung đột khi cả local và remote cùng thay đổi
- tránh xóa hoặc ghi đè dữ liệu một cách im lặng
- dùng HTTP API thật thay vì tự động hóa trình duyệt
- chạy được qua một TUI app bằng `Ink`, không phải chỉ là script CLI thô
