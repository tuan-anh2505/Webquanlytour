const path = require('node:path');
const { getInternalAuthPath, buildInternalAllowList } = require('./internalAccess');
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
  if (!/^[1-9]\d{0,5}(s|m|h|d)$/.test(process.env.INTERNAL_JWT_EXPIRES_IN || '2h')) {
    throw new Error('INTERNAL_JWT_EXPIRES_IN phải là thời lượng dương có đơn vị s, m, h hoặc d.');
  }
  if (process.env.INTERNAL_JWT_SECRET && Buffer.byteLength(process.env.INTERNAL_JWT_SECRET, 'utf8') < 32) {
    throw new Error('INTERNAL_JWT_SECRET cần ít nhất 32 byte.');
  }
  if (process.env.INTERNAL_JWT_SECRET && process.env.INTERNAL_JWT_SECRET === process.env.JWT_SECRET) {
    throw new Error('INTERNAL_JWT_SECRET cần khác JWT_SECRET của khách hàng.');
  }
  if (process.env.NODE_ENV === 'production' && (!process.env.INTERNAL_JWT_SECRET || !process.env.INTERNAL_ALLOWED_IPS)) {
    throw new Error('Production cần INTERNAL_JWT_SECRET riêng và INTERNAL_ALLOWED_IPS rõ ràng.');
  }
  const internalPath = getInternalAuthPath();
  if (!/^\/api\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(internalPath) ||
      /^\/api\/(auth|manage|tours|categories|company|bookings|payments|health|articles|search|wishlist|reviews|notifications|site-config)(\/|$)/.test(internalPath)) {
    throw new Error('INTERNAL_AUTH_PATH cần là đường dẫn /api/... riêng, không trùng namespace hiện có.');
  }
  buildInternalAllowList();
  if (process.env.TRUSTED_PROXY_CIDRS) buildInternalAllowList(process.env.TRUSTED_PROXY_CIDRS);
  for (const [name, fallback, min, max] of [
    ['BOOKING_HOLD_MINUTES', 15, 1, 60],
    ['BOOKING_EXPIRY_INTERVAL_MS', 60000, 1000, 3600000],
    ['BOOKING_EXPIRY_BATCH_SIZE', 100, 1, 500]
  ]) {
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} phải từ ${min} đến ${max}.`);
  }
  if (process.env.BOOKING_EXPIRY_ENABLED && !['true', 'false'].includes(process.env.BOOKING_EXPIRY_ENABLED)) {
    throw new Error('BOOKING_EXPIRY_ENABLED chỉ nhận true hoặc false.');
  }
  if (process.env.PAYMENT_MODE && !['mock', 'disabled'].includes(process.env.PAYMENT_MODE)) {
    throw new Error('PAYMENT_MODE hiện chỉ hỗ trợ mock hoặc disabled.');
  }
  if (process.env.PAYMENT_WEBHOOK_SECRET && Buffer.byteLength(process.env.PAYMENT_WEBHOOK_SECRET, 'utf8') < 32) {
    throw new Error('PAYMENT_WEBHOOK_SECRET cần ít nhất 32 byte.');
  }
  if (process.env.PAYMENT_WEBHOOK_SECRET && [process.env.JWT_SECRET, process.env.INTERNAL_JWT_SECRET].includes(process.env.PAYMENT_WEBHOOK_SECRET)) {
    throw new Error('PAYMENT_WEBHOOK_SECRET cần khác các khóa JWT.');
  }
  if (process.env.DB_TIMEZONE && process.env.DB_TIMEZONE !== '+07:00') {
    throw new Error('DB_TIMEZONE phải là +07:00 để thống nhất lịch khởi hành theo giờ Việt Nam.');
  }
  if (process.env.EMAIL_MODE && !['file', 'smtp', 'disabled'].includes(process.env.EMAIL_MODE)) throw new Error('EMAIL_MODE chỉ nhận file, smtp hoặc disabled.');
  if (process.env.EMAIL_MODE === 'smtp' && !process.env.SMTP_HOST?.trim()) throw new Error('Cần SMTP_HOST khi bật gửi SMTP.');
  if (process.env.EMAIL_MODE === 'smtp' && !process.env.MAIL_FROM?.includes('@')) throw new Error('Cần MAIL_FROM hợp lệ khi bật gửi SMTP.');
  if (Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASSWORD)) throw new Error('SMTP_USER và SMTP_PASSWORD cần được cấu hình cùng nhau.');
  if (process.env.SMTP_SECURE && !['true', 'false'].includes(process.env.SMTP_SECURE)) throw new Error('SMTP_SECURE cần là true hoặc false.');
  if (process.env.MAIL_FROM && /[\r\n]/.test(process.env.MAIL_FROM)) throw new Error('MAIL_FROM không hợp lệ.');
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error('SMTP_PORT không hợp lệ.');
  const interval = Number(process.env.MAIL_INTERVAL_MS || 15000);
  if (!Number.isInteger(interval) || interval < 1000 || interval > 3600000) throw new Error('MAIL_INTERVAL_MS cần từ 1000 đến 3600000.');
  if (process.env.SERVE_FRONTEND && !['true','false'].includes(process.env.SERVE_FRONTEND)) throw new Error('SERVE_FRONTEND cần là true hoặc false.');
  if (process.env.SITE_URL) {
    const site = new URL(process.env.SITE_URL);
    if (!['http:', 'https:'].includes(site.protocol) || site.origin !== process.env.SITE_URL.replace(/\/$/, '')) throw new Error('SITE_URL cần là origin HTTP/HTTPS, không chứa đường dẫn.');
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
