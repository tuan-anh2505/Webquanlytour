/** Chỉ nhận đường dẫn nội bộ để tránh chuyển hướng tới website bên ngoài sau đăng nhập. */
export function safeReturnTo(value, fallback = '/account') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return fallback;
  const pathname = value.split(/[?#]/)[0];
  if (pathname === '/login' || pathname === '/register') return fallback;
  return value;
}

/** Giữ tour và lịch khởi hành đã chọn trong URL để tiếp tục sau xác thực. */
export function bookingPath(tourId, scheduleId) {
  return '/booking/start?' + new URLSearchParams({ tour: String(tourId), schedule: String(scheduleId) });
}

/** Sau đăng nhập vận hành chỉ quay lại khu vực quản trị, không chuyển sang phiên Customer. */
export function safeOperationsReturnTo(value) {
  const result = safeReturnTo(value, '/admin');
  return /^\/admin(?:\/|\?|#|$)/.test(result) ? result : '/admin';
}
