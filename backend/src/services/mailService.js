const fs = require('node:fs/promises');
const path = require('node:path');
const nodemailer = require('nodemailer');
const { getMailConfig } = require('../config/mail');
const Notification = require('../models/NotificationModel');

/** Escape mẫu email, không đưa văn bản khách hàng vào HTML thô. */
function escape(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }

/** Gửi qua SMTP đã cấu hình hoặc lưu bản xem trước private; không log người nhận/bí mật. */
async function deliver(job) {
  const config = getMailConfig();
  if (config.mode === 'disabled') throw Object.assign(new Error('Email disabled'), { code: 'EMAIL_DISABLED' });
  const { to, subject, text, link, notificationId } = job.payload;
  if (typeof to !== 'string' || /[\r\n]/.test(to) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !/^[1-9]\d{0,19}$/.test(String(notificationId)) || typeof text !== 'string' || typeof subject !== 'string' || /[\r\n]/.test(subject)) throw Object.assign(new Error('Invalid email job'), { code: 'INVALID_MAIL' });
  const url = link?.startsWith('/') && !link.startsWith('//') ? config.siteUrl + link : null;
  const host = new URL(config.siteUrl).hostname;
  const message = { from: config.from, to, subject, messageId: `<notification-${notificationId}@${host}>`, text: text + (url ? `\n\n${url}` : ''), html: `<p>${escape(text).replace(/\n/g, '<br>')}</p>${url ? `<p><a href="${escape(url)}">Xem thông tin trên website</a></p>` : ''}` };
  if (config.mode === 'file') {
    await fs.mkdir(config.directory, { recursive: true });
    try { await fs.writeFile(path.join(config.directory, `${notificationId}.json`), JSON.stringify({ ...message, preview: true }, null, 2), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    return { mode: 'file' };
  }
  const transport = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, requireTLS: !config.secure, auth: config.user ? { user: config.user, pass: config.password } : undefined, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000, disableFileAccess: true, disableUrlAccess: true, logger: false });
  try { await transport.sendMail(message); return { mode: 'smtp' }; }
  finally { transport.close(); }
}

/** Xử lý outbox tuần tự và độc lập với response/transaction đặt tour. */
async function flush({ limit = 10, send = deliver, shouldStop = () => false } = {}) {
  if (getMailConfig().mode === 'disabled') return { sent: 0, failed: 0 };
  let sent = 0, failed = 0;
  for (let i = 0; i < limit; i++) {
    if (shouldStop()) break;
    const job = await Notification.claimMail();
    if (!job) break;
    try { const result = await send(job); job.payload.deliveryMode = result?.mode; await Notification.finishMail(job); sent++; }
    catch (error) { await Notification.finishMail(job, error.code || 'DELIVERY_FAILED'); failed++; }
  }
  return { sent, failed };
}

module.exports = { deliver, flush, escape };
