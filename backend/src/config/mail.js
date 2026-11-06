const path = require('node:path');

/** Mặc định chỉ tạo email xem trước local, không tự gửi thư ra Internet. */
function getMailConfig() {
  return {
    mode: process.env.EMAIL_MODE || (process.env.NODE_ENV === 'production' ? 'disabled' : 'file'),
    from: process.env.MAIL_FROM || 'Hành Trình <noreply@example.invalid>',
    directory: path.resolve(__dirname, '../../../.artifacts/mail'),
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    siteUrl: (process.env.SITE_URL || process.env.PUBLIC_ORIGIN?.split(',')[0] || 'http://localhost:5173').trim().replace(/\/$/, '')
  };
}

module.exports = { getMailConfig };
