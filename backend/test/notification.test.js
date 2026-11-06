const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const nodemailer = require('nodemailer');
const pool = require('../src/config/db');
const Booking = require('../src/models/BookingModel');
const Notification = require('../src/models/NotificationModel');
const mail = require('../src/services/mailService');
pool.query = pool.getConnection = async () => { throw new Error('Không được truy cập DB thật.'); };
function mode(t, value) { const old = process.env.EMAIL_MODE; process.env.EMAIL_MODE = value; t.after(() => { if (old === undefined) delete process.env.EMAIL_MODE; else process.env.EMAIL_MODE = old; }); }

test('booking history và outbox dùng đúng cùng connection, lỗi outbox không bị bỏ qua', async t => {
  let received;
  const connection = { query: async () => [{ insertId: '10' }] };
  t.mock.method(Notification, 'bookingEvent', async (ctx, status) => { received = ctx.connection; assert.equal(status, 'confirmed'); throw new Error('Outbox write failed'); });
  await assert.rejects(Booking.history({ connection, booking: { id: '1' } }, 'pending', 'confirmed', null, 'Test'), /Outbox write failed/);
  assert.equal(received, connection);
});

test('enqueue tạo thông báo và mail.pending trong connection nghiệp vụ, replay không thêm email', async t => {
  mode(t, 'file');
  const writes = [];
  const connection = { query: async (sql, params) => {
    if (sql.startsWith('SELECT id FROM notifications')) return [[]];
    if (sql.startsWith('SELECT id,email')) return [[{ id: '3', email: 'qa@example.invalid', status: 'active' }]];
    writes.push({ sql, params }); return [{ insertId: String(writes.length) }];
  } };
  await Notification.enqueue(connection, '3', { type: 'booking.confirmed', title: 'Đã xác nhận', message: 'Nội dung', link: '/bookings/1', dedupe: true });
  assert.equal(writes.length, 2);
  assert.match(writes[1].sql, /mail.pending/);
  assert.equal(JSON.parse(writes[1].params[2]).to, 'qa@example.invalid');
  const old = { query: async () => [[{ id: '1' }]] };
  assert.equal(await Notification.enqueue(old, '3', { type: 'booking.confirmed', link: '/bookings/1', dedupe: true }), '1');
});

test('email disabled vẫn lưu thông báo in-app, không tạo mail outbox', async t => {
  mode(t, 'disabled'); let writes = 0;
  await Notification.enqueue({ query: async sql => { if (sql.startsWith('SELECT')) return [[{ id: '3', status: 'active' }]]; writes++; return [{ insertId: '1' }]; } }, '3', { type: 'test', title: 'Test', message: 'Text' });
  assert.equal(writes, 1);
});

test('notification list/read loại mail.* và scope user trước cập nhật', async t => {
  const calls = [];
  t.mock.method(pool, 'query', async (sql, params) => { calls.push({ sql, params }); return sql.includes('COUNT(*)') ? [[{ total: 0, unread: 0 }]] : [[]]; });
  await Notification.list('3', { page: 1, limit: 20 });
  await assert.rejects(Notification.markRead('3', '99'), { status: 404 });
  assert.ok(calls.every(call => call.sql.includes("type NOT LIKE 'mail.%'")));
  assert.deepEqual(calls[2].params, ['99', '3']);
});

test('claim email có khóa SKIP LOCKED và token lease riêng', async t => {
  let sqlText, claimed;
  t.mock.method(Booking, 'transaction', async work => work({ query: async (sql, params) => {
    if (sql.startsWith('SELECT')) { sqlText = sql; return [[{ id: '8', message: JSON.stringify({ notificationId: '7', attempts: 0 }) }]]; }
    claimed = JSON.parse(params[0]); return [{ affectedRows: 1 }];
  } }));
  const job = await Notification.claimMail();
  assert.match(sqlText, /FOR UPDATE SKIP LOCKED/);
  assert.equal(claimed.attempts, 1);
  assert.match(job.payload.claimToken, /^[\da-f-]{36}$/);
});

test('finish email chỉ áp dụng đúng lease, retry hữu hạn và không lưu thông báo lỗi nhạy cảm', async t => {
  const calls = [];
  t.mock.method(pool, 'query', async (sql, params) => { calls.push({ sql, params }); return [{ affectedRows: 1 }]; });
  await Notification.finishMail({ id: '8', claim: 'lease', payload: { attempts: 1 } }, 'EAUTH');
  await Notification.finishMail({ id: '8', claim: 'lease', payload: { attempts: 3 } }, 'EAUTH');
  assert.equal(calls[0].params[0], 'mail.pending'); assert.equal(calls[1].params[0], 'mail.failed');
  assert.match(calls[0].sql, /AND message=\?/); assert.equal(calls[0].params[4], 'lease');
});

test('file preview escape HTML và không cho notificationId thành đường dẫn tùy ý', async t => {
  mode(t, 'file'); let written;
  t.mock.method(fs, 'mkdir', async () => {});
  t.mock.method(fs, 'writeFile', async (file, text, options) => { written = { file, message: JSON.parse(text), options }; });
  await mail.deliver({ payload: { notificationId: '9', to: 'qa@example.invalid', subject: 'Xác nhận', text: '<script>evil</script>', link: '/bookings/1' } });
  assert.equal(written.options.flag, 'wx'); assert.ok(!written.message.html.includes('<script>'));
  assert.equal(written.message.preview, true);
  await assert.rejects(mail.deliver({ payload: { notificationId: '../../secret', to: 'qa@example.invalid', subject: 'T', text: 'X' } }), { code: 'INVALID_MAIL' });
});

test('SMTP không tắt xác minh TLS và không truy cập tệp/URL từ nội dung mail', async t => {
  mode(t, 'smtp'); let config, message;
  t.mock.method(nodemailer, 'createTransport', options => { config = options; return { sendMail: async value => { message = value; }, close() {} }; });
  await mail.deliver({ payload: { notificationId: '9', to: 'qa@example.invalid', subject: 'T', text: 'Nội dung' } });
  assert.equal(config.disableFileAccess, true); assert.equal(config.disableUrlAccess, true);
  assert.ok(config.secure || config.requireTLS); assert.equal(message.to, 'qa@example.invalid');
});

test('flush lỗi gửi không làm mất job, tiếp tục các mail khác và không giữ transaction khi gửi', async t => {
  mode(t, 'file'); let index = 0; const done = [];
  t.mock.method(Notification, 'claimMail', async () => index++ < 2 ? { id: String(index), payload: {} } : null);
  t.mock.method(Notification, 'finishMail', async (job, code) => done.push([job.id, code]));
  const result = await mail.flush({ send: async job => { if (job.id === '1') throw Object.assign(new Error('secret'), { code: 'EAUTH' }); return { mode: 'file' }; } });
  assert.deepEqual(result, { sent: 1, failed: 1 }); assert.deepEqual(done, [['1','EAUTH'],['2',undefined]]);
});

test('shutdown dừng nhận mail mới sau lần đang gửi, không vét hết batch', async t => {
  mode(t, 'file'); let stopping = false, claimed = 0;
  t.mock.method(Notification, 'claimMail', async () => ({ id: String(++claimed), payload: {} }));
  t.mock.method(Notification, 'finishMail', async () => {});
  const result = await mail.flush({ shouldStop: () => stopping, send: async () => { stopping = true; return { mode: 'file' }; } });
  assert.equal(claimed, 1); assert.equal(result.sent, 1);
});
