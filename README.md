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

Nhập họ tên, email và mật khẩu trực tiếp trong terminal; mật khẩu được ẩn. Lệnh này **chỉ ghi tài khoản mới khi bạn chủ động chạy**, từ chối nếu đã có Admin đang hoạt động, không có mật khẩu mặc định. Sau đó đăng nhập trên web, vào `/admin`, tạo Staff và cấp quyền.

## Phạm vi Giai đoạn 1

- Đăng ký Customer, đăng nhập JWT, mật khẩu bcrypt, hồ sơ chính chủ, đăng xuất trên trình duyệt.
- Admin quản lý tài khoản, khóa tài khoản, cấp/thu hồi quyền Staff; bảo vệ Admin hoạt động cuối cùng.
- Quản lý danh mục, tour, URL ảnh, ngày lịch trình và lịch khởi hành cơ bản. Dùng trạng thái để ẩn/ngừng mở bán, không có endpoint xóa bản ghi nghiệp vụ.
- Guest tìm kiếm, lọc, xem tour `active` và lịch khởi hành `open` trong tương lai; không cần token.
- Nút Đặt tour giữ lựa chọn qua đăng nhập. **Chưa tạo booking, giữ chỗ hoặc thanh toán**; các nghiệp vụ này thuộc Giai đoạn 2.
- Frontend dùng dữ liệu từ API, có trạng thái trống khi database chưa có nội dung. Không tự thêm dữ liệu mẫu.

Trong Admin, tạo danh mục → tạo tour → thêm URL ảnh/lịch trình/lịch khởi hành → chuyển tour sang `active` để xuất hiện trên trang công khai. Ảnh được quản lý bằng URL; upload file chưa nằm trong phiên bản này.

## Kiểm tra

Trong `backend`: `npm test`. Trong `frontend`: `npm test` và `npm run build`.

Các test dùng repository/pool giả lập và JWT/bcrypt thật, không ghi DB thật. `/api/health` truy vấn MySQL chỉ đọc, trả `503` nếu DB không sẵn sàng. Khi chạy server, MySQL phải kết nối thành công trước khi mở cổng HTTP.

Xem [chức năng và công dụng các hàm](docs/GIAI_DOAN_1.md), [hợp đồng API](docs/API.md).
