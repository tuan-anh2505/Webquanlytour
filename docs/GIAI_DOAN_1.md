# Giai đoạn 1 — Nền tảng

## Kiến trúc và công dụng các thành phần

| Thành phần | Công dụng |
| --- | --- |
| `backend/src/server.js` — `startServer`, `shutdown` | Kiểm tra cấu hình/MySQL trước khi mở HTTP; giải phóng server và pool khi dừng. |
| `backend/src/app.js` | Lắp ráp Express, CORS, giới hạn JSON, rate limit, router và xử lý lỗi; tách `listen` để kiểm thử. |
| `config/db.js` | Pool dùng chung, hỗ trợ `DB_PORT`, giữ BIGINT chính xác, DATETIME dạng chuỗi; đặt múi giờ phiên kết nối `+07:00`. Không migrate hay seed. |
| `config/env.js` — `validateEnvironment`, `getAllowedOrigins` | Kiểm tra biến bắt buộc, độ dài JWT secret, thời lượng token, cổng và danh sách frontend được phép. |
| `config/permissions.js` | Danh sách khóa quyền Staff và nhãn hiển thị, tái sử dụng bởi API cấp quyền. |
| `middlewares/auth.js` — `authenticate` | Kiểm tra Bearer JWT đúng thuật toán, issuer, audience; tải lại user/status/quyền từ DB mỗi yêu cầu. |
| `requireRoles`, `requirePermission` | Giới hạn nhóm vai trò hoặc quyền thao tác. Admin được toàn quyền; Staff cần quyền cụ thể; Customer không được vào API quản trị. |
| `middlewares/security.js` | Mã request, header bảo vệ JSON, tắt cache; giới hạn số lần gọi login/register theo IP. |
| `middlewares/errorHandler.js` | Chuyển lỗi dữ liệu/SQL sang JSON HTTP phù hợp, không trả SQL/stack/bí mật. |
| `models/UserModel.js` | Tái sử dụng model hiện có để tìm/tạo user, cập nhật hồ sơ, danh sách user, kiểm tra Admin cuối cùng và lưu quyền Staff. |
| `controllers/authController.js` | Đăng ký Customer, hash mật khẩu, đăng nhập, cấp token và hồ sơ chính chủ. |
| `controllers/userController.js` | Admin tạo/sửa tài khoản, đọc định nghĩa quyền, cấp/thu hồi quyền Staff. |
| `validators/authValidator.js` | Kiểm tra email, mật khẩu UTF-8, tên, điện thoại, BIGINT và whitelist trường; chặn gán role/status qua API khách. |
| `models/TourModel.js` | Truy vấn nội dung công khai/quản trị; transaction cho ảnh đại diện, chỉnh tour, lịch trình và sức chứa lịch khởi hành. |
| `validators/tourValidator.js` | Kiểm tra tiền DECIMAL, ngày thật, slug, URL ảnh, enum, phân trang, sức chứa và trường nội bộ. |
| `controllers/tourController.js`, `routes/tourRoutes.js` | API Guest riêng với API quản trị; kiểm tra quyền trước khi gọi các thao tác tour. |
| `scripts/create-admin.js` | Tạo Admin đầu tiên bằng nhập liệu có mật khẩu ẩn, không dùng tài khoản mặc định. |
| `frontend/src/services/api.js` | Gọi API JSON, đính kèm JWT từ `sessionStorage`, thống nhất lỗi, báo phiên hết hạn. |
| `hooks/useAuth.jsx` | Quản lý phiên, đăng nhập/đăng ký/đăng xuất và quyền hiển thị; quyền thực vẫn do backend quyết định. |
| `hooks/useResource.js` | Tải dữ liệu, hiển thị lỗi/loading và hủy request cũ khi chuyển trang/bộ lọc. |
| `routes/ProtectedRoute.jsx` | Bảo vệ tài khoản/quản trị; đưa khách tới đăng nhập và giữ đường dẫn nội bộ cần quay lại. |
| `services/navigation.js` | Chống chuyển hướng ra ngoài, giữ ID tour/lịch dưới dạng chuỗi. |
| `pages/public` | Danh sách, tìm/lọc tour, chi tiết, lịch và đăng nhập/đăng ký. |
| `pages/customer` | Cập nhật hồ sơ chính chủ, kiểm tra lại lịch đã chọn sau đăng nhập. |
| `pages/admin` | Nội dung tour, danh mục, URL ảnh, từng ngày lịch trình, lịch khởi hành; Admin quản lý user và quyền Staff. |

Các hàm quan trọng còn có chú thích/JSDoc tiếng Việt ngay trong source. Thư mục `jobs` chưa sử dụng: hết hạn giữ chỗ thuộc Giai đoạn 2; `ultis` hiện có được giữ nguyên.

## Quyền và trạng thái

Guest không có bản ghi/role riêng, chỉ gọi API công khai. Customer quản lý hồ sơ của chính mình; booking chính chủ được bổ sung khi triển khai Giai đoạn 2. Tài khoản `banned` bị chặn ngay cả khi còn JWT hợp lệ. JWT dùng HS256, issuer `webquanlytour`, audience `webquanlytour-web`, mặc định hết hạn sau 8 giờ. Đăng xuất xóa token ở phiên trình duyệt; chưa có cơ chế thu hồi từng token hoặc refresh token.

| Quyền Staff | Công dụng |
| --- | --- |
| `tours.read` | Đọc danh sách/chi tiết quản trị, kể cả nháp/ẩn; không tự cấp quyền đọc lịch nội bộ. |
| `tours.write` | Tạo/sửa tour, ảnh và lịch trình. |
| `categories.read` | Đọc trang quản lý danh mục. |
| `categories.write` | Tạo/sửa danh mục. |
| `schedules.read` | Đọc toàn bộ lịch và thông tin vận hành. |
| `schedules.write` | Tạo/sửa lịch và giá riêng, không tự sửa số chỗ đã đặt. |

Quyền đọc/ghi độc lập. Để dùng đầy đủ biểu mẫu trên web, cấp quyền đọc cùng quyền ghi tương ứng; giao diện lịch nằm trong chi tiết tour nên cũng cần `tours.read`. Admin quản lý/cấp quyền Staff, không giao việc cấp quyền cho Staff. Khi thay đổi role, quyền Staff được giữ trong DB nhưng chỉ có hiệu lực khi tài khoản mang role `staff`; Admin có thể chỉnh lại danh sách quyền rõ ràng.

Tour `draft` và `hidden` không thể truy cập qua API công khai, kể cả biết ID/slug. Lịch Guest chỉ gồm `open` và chưa khởi hành, không có ghi chú/liên hệ nội bộ. Giá hiệu lực dùng giá riêng lịch nếu có, nếu không dùng giá mặc định tour. Số chỗ hiển thị bằng `max_capacity - booked_seats`, chưa phải cam kết giữ chỗ.

Ngày lịch trình không được vượt số ngày của tour. Muốn giảm số ngày tour, cần sửa các ngày lịch trình vượt phạm vi trước; các cập nhật khóa cùng bản ghi tour để bảo đảm nhất quán.

## Dữ liệu và giới hạn phạm vi

Tiếp tục dùng đúng 21 bảng đã có. Không có Vendor, company selector, schema mới hay script tự seed. Thao tác cấp lại quyền Staff thay thế danh sách quyền trong transaction theo yêu cầu Admin; các endpoint tour/user không xóa cứng bản ghi nghiệp vụ. Thêm/sửa ảnh dùng URL, chưa có upload file. Nội dung tour/lịch trình hiển thị dạng văn bản an toàn, chưa có trình soạn thảo HTML.

Lịch khởi hành cơ bản được đưa vào Giai đoạn 1 để Guest có thể xem và chọn ngày. Giữ chỗ, đặt đồng thời, hành khách, xác nhận/hủy/hết hạn booking, thanh toán và webhook thuộc Giai đoạn 2. Dashboard thống kê, hướng dẫn viên, bài viết, email, đánh giá và yêu thích thuộc Giai đoạn 3. Backup, giám sát, kiểm thử tải và deploy thuộc Giai đoạn 4.

Rate limit hiện lưu trong bộ nhớ một tiến trình, chưa đồng bộ giữa nhiều instance. Khi vận hành cần cấu hình reverse proxy và kho rate limit dùng chung theo kiến trúc triển khai.

## Nghiệm thu

1. Không đăng nhập: tìm/lọc, xem tour active, ảnh, lịch trình, giá và lịch mở. Tour nháp/ẩn trả 404.
2. Chọn lịch rồi bấm Đặt tour: chuyển đăng nhập/đăng ký, quay lại đúng lựa chọn; chưa tạo đơn hay trừ chỗ.
3. Đăng ký luôn là Customer, không trả hash; thử gửi role/status đặc quyền sẽ bị từ chối.
4. Customer sửa tên/điện thoại của mình; không gọi được API quản trị.
5. Staff chỉ đọc/ghi đúng quyền cấp. Thu hồi quyền hoặc khóa user có hiệu lực trên yêu cầu tiếp theo.
6. Admin tạo tài khoản và cấp quyền; không thể khóa/hạ quyền Admin hoạt động cuối cùng.
7. Tạo danh mục/tour/ảnh/lịch trình/lịch cơ bản, đổi tour active rồi kiểm tra trang công khai. Để `draft` khi chưa sẵn sàng bán.
8. `npm test` ở backend; `npm test` và `npm run build` ở frontend.

Các test tự động dùng repository/pool giả lập để bảo vệ DB hiện hữu. Kiểm tra MySQL thật chỉ đọc; chưa chạy thử tạo/sửa bản ghi thật hoặc kiểm thử tải/đặt chỗ đồng thời trong Giai đoạn 1.
