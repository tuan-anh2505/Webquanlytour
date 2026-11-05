# API Giai đoạn 1

Base URL local: `http://localhost:5000/api`. Thành công dùng `{ "data": ... }`, danh sách phân trang thêm `meta: { page, limit, total, totalPages }`. Lỗi dùng `{ "message": "...", "errors": [...] }` (errors tùy chọn). Gửi `Content-Type: application/json` khi có body; route cần đăng nhập nhận `Authorization: Bearer <token>`.

## Công khai — không cần token

| Method | Đường dẫn | Chức năng |
| --- | --- | --- |
| GET | `/health` | Kiểm tra DB chỉ đọc, 200 hoặc 503. |
| GET | `/company` | Hồ sơ công ty id=1, `data: null` khi chưa có dữ liệu. |
| GET | `/categories` | Danh mục cho bộ lọc. |
| GET | `/tours` | Tour active, phân trang/tìm/lọc. |
| GET | `/tours/:idOrSlug` | Chi tiết tour active với `images`, `itineraries`, `schedules`. |
| GET | `/tours/:idOrSlug/schedules` | Lịch open trong tương lai, giá hiệu lực và số chỗ còn lại. |
| POST | `/auth/register` | `{full_name,email,password,phone?}`, luôn Customer. |
| POST | `/auth/login` | `{email,password}`. |

Register/login trả `{data:{user,token}}`; user không có `password_hash`. Đăng ký: tên tối đa 150 ký tự, email 255, phone 25; mật khẩu tối thiểu 8 ký tự và tối đa 72 byte UTF-8. Không gửi `role`/`status` vào đăng ký. Login giới hạn 20 request/IP/15 phút; register 10 request/IP/giờ trong một tiến trình.

Query tour: `page` mặc định 1, `limit` mặc định 12 (tối đa 100), `q`, `category_id`, `destination`, `tour_type=domestic|international`, `min_price`, `max_price`, `departure_from`, `departure_to` (`YYYY-MM-DD`). Khoảng ngày lọc theo lịch mở trong tương lai. Giá lọc là `base_price` của tour; giá riêng mỗi lịch nằm trong chi tiết/lịch khởi hành.

## Hồ sơ — cần đăng nhập

| Method | Đường dẫn | Body/chức năng |
| --- | --- | --- |
| GET | `/auth/me` | Hồ sơ hiện tại và `permissions`. |
| PATCH | `/auth/me` | `{full_name?,phone?}`; không nhận id, email, role, status. |

Thiếu/sai/hết hạn token hoặc tài khoản bị khóa: 401. Không đủ quyền: 403. Hồ sơ luôn lấy ID từ JWT, không dựa vào user_id client gửi.

## Nội dung — Admin hoặc Staff có quyền

Tất cả đường dẫn sau có tiền tố `/manage`. Quyền đọc/ghi độc lập.

| Method | Đường dẫn | Quyền Staff |
| --- | --- | --- |
| GET / POST | `/categories` | `categories.read` / `categories.write` |
| PATCH | `/categories/:id` | `categories.write` |
| GET / POST | `/tours` | `tours.read` / `tours.write` |
| GET / PATCH | `/tours/:id` | `tours.read` / `tours.write` |
| POST | `/tours/:id/images` | `tours.write` |
| PATCH | `/tours/:id/images/:imageId` | `tours.write` |
| POST | `/tours/:id/itineraries` | `tours.write` |
| PATCH | `/tours/:id/itineraries/:itineraryId` | `tours.write` |
| GET / POST | `/tours/:id/schedules` | `schedules.read` / `schedules.write` |
| PATCH | `/tours/:id/schedules/:scheduleId` | `schedules.write` |

GET `/manage/tours` dùng bộ lọc công khai, thêm `status=draft|active|hidden`. Chi tiết quản trị chỉ có lịch đầy đủ khi Admin hoặc được cấp `schedules.read`.

Body danh mục: `{name,slug?,description?}`. Slug tự tạo từ tên nếu chưa gửi; nhập tay dùng chữ thường/số/gạch nối và không toàn số.

Body tạo tour tối thiểu:

```json
{
  "title": "Đà Nẵng - Hội An",
  "category_id": null,
  "base_price": "2500000.00",
  "duration_days": 3,
  "duration_nights": 2,
  "tour_type": "domestic",
  "status": "draft"
}
```

Có thể thêm `slug`, `child_price`, `infant_price`, `summary`, `description`, `highlights`, `included_services`, `excluded_services`, `cancellation_policy`, `departure_location`, `destination`, `meta_title`, `meta_description`. PATCH chỉ cần gửi trường thay đổi. `created_by` lấy từ token; không nhận id/người tạo từ client.

Body ảnh: `{image_url,alt_text?,sort_order?,is_featured?}`; URL http/https hoặc đường dẫn `/...`, không nhận `data:`/`javascript:`. Chọn ảnh đại diện cập nhật trong transaction. Không có upload file/xóa ảnh.

Body lịch trình: `{day_number,title,content}`, PATCH sửa một hay nhiều trường. Nội dung là văn bản, không thực thi HTML.

Body lịch khởi hành:

```json
{
  "departure_date": "2027-03-01T08:00",
  "return_date": "2027-03-03T18:00",
  "max_capacity": 20,
  "adult_price_override": null,
  "status": "open"
}
```

Nhận thêm `child_price_override`, `infant_price_override`, `meeting_point`, `meeting_time`, `transport_info`, `accommodation_info`, `emergency_phone`, `customer_instructions`, `notes`. DATETIME không múi giờ được hiểu là giờ Việt Nam; ISO có offset/Z được đổi về `+07:00`. Giá riêng `null` dùng giá mặc định tour. Không nhận `booked_seats`; sức chứa mới không được thấp hơn số chỗ đã đặt. API công khai không trả trường vận hành nội bộ.

ID BIGINT nên gửi dạng chuỗi để không mất độ chính xác. Tiền DECIMAL(12,2) nhận số hoặc chuỗi thập phân không âm, tối đa 2 số lẻ; nên dùng chuỗi khi gọi API.

## Tài khoản và cấp quyền — chỉ Admin

| Method | Đường dẫn | Body/chức năng |
| --- | --- | --- |
| GET | `/manage/users` | `page`, `limit`, `q`, `role` |
| POST | `/manage/users` | `{full_name,email,password,phone?,role?}`; role mặc định staff, status mặc định active. |
| PATCH | `/manage/users/:id` | `{full_name?,phone?,role?,status?}` |
| GET | `/manage/users/permissions` | Danh sách `{key,label}` được hỗ trợ. |
| GET | `/manage/users/:id/permissions` | Mảng khóa quyền của Staff. |
| PUT | `/manage/users/:id/permissions` | `{permissions:["tours.read","tours.write"]}`, thay thế toàn bộ danh sách quyền. |

Không nhận khóa quyền ngoài whitelist. Chỉ Staff được cấp quyền chi tiết. Không có API xóa user; dùng `status=banned`. Khóa/hạ quyền Admin hoạt động cuối cùng trả 409.

## Mã lỗi

400 dữ liệu không hợp lệ; 401 cần đăng nhập/phiên không hợp lệ; 403 thiếu quyền/origin không được phép; 404 tài nguyên không tồn tại hoặc không công khai; 409 trùng dữ liệu hoặc xung đột nghiệp vụ; 413 body vượt 256 KiB; 429 quá nhiều yêu cầu; 500 lỗi nội bộ; 503 DB chưa sẵn sàng. Không trả SQL/stack trace cho client.
