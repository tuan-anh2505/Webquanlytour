// Danh sách cố định để Admin cấp quyền Staff; không cần thêm bảng permission mới.
const PERMISSIONS = Object.freeze([
  { key: 'tours.read', label: 'Xem nội dung tour trong trang quản trị' },
  { key: 'tours.write', label: 'Tạo, sửa tour, hình ảnh và lịch trình' },
  { key: 'categories.read', label: 'Xem danh mục trong trang quản trị' },
  { key: 'categories.write', label: 'Tạo và sửa danh mục' },
  { key: 'schedules.read', label: 'Xem lịch khởi hành trong trang quản trị' },
  { key: 'schedules.write', label: 'Tạo và sửa lịch khởi hành' },
  { key: 'bookings.read', label: 'Xem booking và thông tin hành khách' },
  { key: 'bookings.write', label: 'Xác nhận và hủy booking' },
  { key: 'payments.read', label: 'Xem thanh toán và yêu cầu hoàn tiền' },
  { key: 'payments.write', label: 'Xử lý hoàn tiền thử nghiệm' }
]);
const PERMISSION_KEYS = Object.freeze(PERMISSIONS.map((permission) => permission.key));

module.exports = { PERMISSIONS, PERMISSION_KEYS };
