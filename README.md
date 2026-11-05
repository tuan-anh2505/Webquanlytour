# Webquanlytour

Website quản lý và kinh doanh tour cho **một công ty**, sử dụng React, Express và MySQL `webquanlytour_v2` hiện có. Không có Vendor. Guest xem tour và lịch khởi hành tự do; đăng nhập chỉ bắt buộc khi bắt đầu đặt tour hoặc truy cập tài khoản.

## Chạy dự án

Yêu cầu: Node.js 22+, npm và MySQL đang chạy với 21 bảng đã tạo. Dự án **không tự chạy migration, seed, tạo lại bảng hoặc xóa dữ liệu**.

Từ thư mục `Webquanlytour`, mở terminal thứ nhất:

```powershell
cd backend
npm install
npm run dev
```

Giữ nguyên `backend/.env` hiện có. Khi cài trên máy mới, tham khảo `backend/.env.example`: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `PUBLIC_ORIGIN`. `JWT_SECRET` phải có ít nhất 32 byte. `JWT_EXPIRES_IN` mặc định `8h`, nhận đơn vị `s`, `m`, `h`, `d`. Lịch khởi hành được lưu và hiển thị theo giờ Việt Nam `+07:00`.

Mở terminal thứ hai từ `Webquanlytour`:

```powershell
cd frontend
npm install
npm run dev
```

Truy cập **http://localhost:5173**. Frontend chuyển `/api` tới backend **http://127.0.0.1:5000** trong chế độ phát triển. Nếu đổi cổng backend, cấu hình `API_PROXY_TARGET` ở frontend; nếu gọi trực tiếp backend, cấu hình `VITE_API_URL` và thêm đúng origin frontend vào `PUBLIC_ORIGIN` (danh sách cách nhau bằng dấu phẩy). Biến frontend không được chứa mật khẩu DB hay JWT secret.

## Admin đầu tiên

Nếu chưa có Admin đang hoạt động, chạy trong thư mục `backend`:

```powershell
npm run create-admin
```

Nhập họ tên, email và mật khẩu trực tiếp trong terminal; mật khẩu được ẩn. Lệnh này **chỉ ghi tài khoản mới khi bạn chủ động chạy**, từ chối nếu đã có Admin đang hoạt động, không có mật khẩu mặc định. Sau đó đăng nhập tại **http://localhost:5173/operations/sign-in**, vào `/admin`, tạo Staff và cấp quyền.

## Hai cổng đăng nhập

Khách dùng `/login`, `/register` và API `/api/auth`. Admin/Staff dùng trang `/operations/sign-in` và API `/api/operations/auth`. Phiên và chữ ký JWT được tách; đăng nhập sai cổng bị từ chối với thông báo chung. Phiên cũ từ Giai đoạn 1 cần đăng nhập lại.

Cổng vận hành không có liên kết trong menu khách, có giới hạn thử đăng nhập riêng và API chỉ nhận IP/CIDR thuộc `INTERNAL_ALLOWED_IPS` (mặc định loopback). **Đường dẫn không phải bí mật bảo mật**; xem [giới hạn và cấu hình cổng nội bộ](docs/BAO_MAT_DANG_NHAP.md) khi dùng VPN hoặc reverse proxy.

## Phạm vi Giai đoạn 1

- Đăng ký Customer, đăng nhập JWT, mật khẩu bcrypt, hồ sơ chính chủ, đăng xuất trên trình duyệt.
- Admin quản lý tài khoản, khóa tài khoản, cấp/thu hồi quyền Staff; bảo vệ Admin hoạt động cuối cùng.
- Quản lý danh mục, tour, URL ảnh, ngày lịch trình và lịch khởi hành cơ bản. Dùng trạng thái để ẩn/ngừng mở bán, không có endpoint xóa bản ghi nghiệp vụ.
- Guest tìm kiếm, lọc, xem tour `active` và lịch khởi hành `open` trong tương lai; không cần token.
- Nút Đặt tour giữ lựa chọn qua đăng nhập rồi mở biểu mẫu hành khách; nghiệp vụ đặt chỗ được mô tả ở Giai đoạn 2 bên dưới.
- Frontend dùng dữ liệu từ API, có trạng thái trống khi database chưa có nội dung. Không tự thêm dữ liệu mẫu.

Trong Admin, tạo danh mục → tạo tour → thêm URL ảnh/lịch trình/lịch khởi hành → chuyển tour sang `active` để xuất hiện trên trang công khai. Ảnh được quản lý bằng URL; upload file chưa nằm trong phiên bản này.

## Giai đoạn 2 đã triển khai

- Tạo booking và thông tin hành khách; Customer xem/hủy đơn chính chủ, Admin/Staff thao tác theo quyền.
- Giá chốt tại backend từ tour/lịch khởi hành, lưu snapshot theo từng hành khách; không nhận giá hoặc số chỗ do client tự gửi.
- Giữ chỗ mặc định 15 phút, khóa MySQL theo thứ tự nhất quán, chống giữ vượt sức chứa và chống tạo trùng khi gửi lại yêu cầu.
- Job hết hạn tự trả chỗ; hủy đơn trước giờ khởi hành trả chỗ một lần, lưu lịch sử trạng thái và tạo yêu cầu hoàn tiền nếu đã thanh toán.
- Thanh toán **mô phỏng**, webhook HMAC có timestamp, xử lý sự kiện lặp/đến muộn và hoàn tiền thử nghiệm. Không có giao dịch ngân hàng thật; mock luôn bị tắt trong production.
- Giao diện quản lý booking/thanh toán, sidebar xanh navy theo ảnh tham khảo; cổng đăng nhập nội bộ giữ bố cục đơn giản. Dashboard thống kê đầy đủ thuộc Giai đoạn 3.

Luồng dùng thử: chọn tour/lịch → Đặt tour → đăng nhập Customer → nhập liên hệ/hành khách → tạo booking → Thanh toán thử nghiệm → chọn thành công/thất bại. Xem trạng thái tại `/bookings`. Nhân viên vào `/admin/bookings` và `/admin/payments` bằng cổng nội bộ.

Staff cần được Admin cấp `bookings.read`, `bookings.write`, `payments.read`, `payments.write` theo công việc. Quyền đọc/ghi độc lập; để dùng biểu mẫu quản trị, cấp cả quyền đọc tương ứng.

Biến cấu hình mới có mặc định local, không cần ghi đè `.env` hiện có: `BOOKING_HOLD_MINUTES=15`, `BOOKING_EXPIRY_ENABLED=true`, `BOOKING_EXPIRY_INTERVAL_MS=60000`, `BOOKING_EXPIRY_BATCH_SIZE=100`, `PAYMENT_MODE=mock`. Webhook dùng khóa riêng dẫn xuất cho development nếu chưa có `PAYMENT_WEBHOOK_SECRET`; không đặt bí mật vào frontend.

Chi tiết hàm, API, chính sách giữ/hủy/hoàn và giới hạn thử nghiệm ở [Giai đoạn 2](docs/GIAI_DOAN_2.md).

## Kiểm tra

Trong `backend`: `npm test`. Trong `frontend`: `npm test` và `npm run build`.

Các test dùng repository/pool giả lập và JWT/bcrypt thật, không ghi DB thật. `/api/health` truy vấn MySQL chỉ đọc, trả `503` nếu DB không sẵn sàng. Khi chạy server, MySQL phải kết nối thành công trước khi mở cổng HTTP.

Xem [chức năng Giai đoạn 1](docs/GIAI_DOAN_1.md), [Giai đoạn 2](docs/GIAI_DOAN_2.md), [hợp đồng API](docs/API.md) và [cổng đăng nhập nội bộ](docs/BAO_MAT_DANG_NHAP.md).
