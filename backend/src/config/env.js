const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

/** Kiểm tra cấu hình trước khi mở cổng; chỉ báo tên biến thiếu, không ghi bí mật ra log. */
function validateEnvironment() {
  const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET', 'PUBLIC_ORIGIN'];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Thiếu cấu hình: ${missing.join(', ')}`);
  if (Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
    throw new Error('JWT_SECRET cần ít nhất 32 byte.');
  }
  if (!/^[1-9]\d{0,5}(s|m|h|d)$/.test(process.env.JWT_EXPIRES_IN || '8h')) {
    throw new Error('JWT_EXPIRES_IN phải là thời lượng dương có đơn vị s, m, h hoặc d (ví dụ 8h).');
  }
  if (process.env.DB_TIMEZONE && process.env.DB_TIMEZONE !== '+07:00') {
    throw new Error('DB_TIMEZONE phải là +07:00 để thống nhất lịch khởi hành theo giờ Việt Nam.');
  }
  for (const [name, fallback] of [['PORT', 5000], ['DB_PORT', 3306]]) {
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error(`${name} phải là cổng từ 1 đến 65535.`);
    }
  }
  const origins = getAllowedOrigins();
  if (!origins.length) throw new Error('PUBLIC_ORIGIN cần ít nhất một origin hợp lệ.');
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error('PUBLIC_ORIGIN phải gồm các origin HTTP/HTTPS, cách nhau bằng dấu phẩy.');
    }
  }
}

/** Lấy danh sách frontend được phép gọi API; giá trị mặc định phục vụ chạy local. */
function getAllowedOrigins() {
  return (process.env.PUBLIC_ORIGIN || 'http://localhost:5173')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
}

module.exports = { validateEnvironment, getAllowedOrigins };
