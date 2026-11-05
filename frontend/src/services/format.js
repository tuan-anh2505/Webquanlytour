/** Hiển thị tiền VND, giữ việc tính giá chính thức ở backend. */
export function money(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
}

/** MySQL trả ngày giờ theo giờ Việt Nam; không ép chuỗi không múi giờ thành UTC. */
export function dateTime(value, includeTime = false) {
  if (!value) return 'Chưa cập nhật';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(date);
}

export const statusLabels = { active: 'Đang hiển thị', draft: 'Bản nháp', hidden: 'Đã ẩn', open: 'Mở đăng ký', closed: 'Đã đóng', cancelled: 'Đã hủy', banned: 'Đã khóa', admin: 'Quản trị viên', staff: 'Nhân viên', customer: 'Khách hàng' };
