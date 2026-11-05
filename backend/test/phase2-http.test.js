const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'phase2-http-test-secret-at-least-thirty-two-bytes';
process.env.PUBLIC_ORIGIN = 'http://localhost:5173';
process.env.INTERNAL_ALLOWED_IPS = '127.0.0.1,::1';
const pool = require('../src/config/db');
const User = require('../src/models/UserModel');
const Booking = require('../src/models/BookingModel');
const service = require('../src/services/bookingService');
const { getPortalConfig } = require('../src/config/authPortal');
// Không cho route test rơi xuống DB thật nếu quên stub một dependency.
pool.query = pool.getConnection = async () => { throw new Error('Test không được truy cập DB thật.'); };
const app = require('../src/app');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });

/** Dùng JWT thật với đúng cổng, user/permission trả từ repository giả. */
function setup(t, permissions = []) {
  t.mock.method(User, 'findById', async id => ({ id, role: { '1': 'admin', '2': 'staff', '3': 'customer', '4': 'customer' }[id], status: 'active' }));
  t.mock.method(User, 'permissionsFor', async () => permissions);
}
function token(id, portal) {
  const config = getPortalConfig(portal);
  return jwt.sign({ portal }, config.secret, { subject: id, issuer: config.issuer, audience: config.audience, algorithm: 'HS256', expiresIn: '1h' });
}
async function request(path, { id, portal = 'customer', method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(id ? { Authorization: `Bearer ${token(id, portal)}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

test('Guest vẫn duyệt tour, nhưng tạo/list booking cần Customer token đúng cổng', async (t) => {
  setup(t);
  assert.equal((await request('/bookings')).status, 401);
  assert.equal((await request('/bookings', { id: '1', portal: 'operations', method: 'POST', body: {} })).status, 401);
  t.mock.method(Booking, 'list', async (filters, options) => {
    assert.equal(options.customerId, '3');
    assert.equal(options.operator, undefined);
    return { data: [], meta: { total: 0 } };
  });
  assert.equal((await request('/bookings?customer_id=1', { id: '3' })).status, 200);
});

test('tạo booking chuyển user ID từ JWT và khóa retry header tới nghiệp vụ', async (t) => {
  setup(t);
  const key = '91d23587-04be-46b2-ae19-57b1c11c6574';
  t.mock.method(service, 'createBooking', async (customerId, input, requestKey) => {
    assert.equal(customerId, '3'); assert.equal(requestKey, key); assert.equal(input.schedule_id, '9');
    return { booking: { id: '21', total_price: '150.00', status: 'pending' }, replay: false };
  });
  const result = await request('/bookings', { id: '3', method: 'POST', headers: { 'Idempotency-Key': key }, body: { schedule_id: '9' } });
  assert.equal(result.status, 201);
  assert.equal(result.body.data.id, '21');
  assert.equal(result.body.replay, false);
});

test('retry trả 200; chi tiết và hủy dùng chính chủ từ token, không nhận owner qua query', async (t) => {
  setup(t);
  t.mock.method(service, 'createBooking', async () => ({ booking: { id: '21' }, replay: true }));
  assert.equal((await request('/bookings', { id: '3', method: 'POST', body: {} })).status, 200);
  t.mock.method(service, 'getBooking', async (id, options) => {
    assert.equal(id, '21'); assert.equal(options.customerId, '4');
    throw Object.assign(new Error('Không tìm thấy booking.'), { status: 404 });
  });
  assert.equal((await request('/bookings/21?customer_id=3', { id: '4' })).status, 404);
  t.mock.method(service, 'cancelBooking', async (id, options) => {
    assert.equal(options.customerId, '3'); assert.equal(options.operator, undefined);
    return { id, status: 'cancelled' };
  });
  assert.equal((await request('/bookings/21/cancel', { id: '3', method: 'POST', body: { reason: 'Đổi kế hoạch' } })).body.data.status, 'cancelled');
});

test('Staff cần quyền booking cụ thể; Customer token không vào API quản trị', async (t) => {
  setup(t, ['bookings.read']);
  t.mock.method(Booking, 'list', async (filters, options) => {
    assert.equal(options.operator, true);
    return { data: [], meta: { total: 0 } };
  });
  assert.equal((await request('/manage/bookings', { id: '3' })).status, 401);
  assert.equal((await request('/manage/bookings', { id: '2', portal: 'operations' })).status, 200);
  assert.equal((await request('/manage/bookings/21/confirm', { id: '2', portal: 'operations', method: 'POST', body: {} })).status, 403);
});

test('Admin xác nhận/hủy truyền actor từ phiên vận hành; không có endpoint tự gán paid', async (t) => {
  setup(t);
  t.mock.method(service, 'confirmBooking', async (id, options) => {
    assert.equal(options.actorId, '1'); return { id, status: 'confirmed' };
  });
  assert.equal((await request('/manage/bookings/21/confirm', { id: '1', portal: 'operations', method: 'POST', body: {} })).status, 200);
  assert.equal((await request('/bookings/21', { id: '3', method: 'PATCH', body: { status: 'confirmed' } })).status, 404);
});

test('preflight cho phép header Idempotency-Key từ frontend được cấu hình', async () => {
  const res = await fetch(base + '/bookings', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Idempotency-Key,Content-Type' } });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('access-control-allow-headers'), /Idempotency-Key/i);
});
