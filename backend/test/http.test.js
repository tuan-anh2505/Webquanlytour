const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'test-only-secret-for-http-integration-at-least-32-bytes';
process.env.PUBLIC_ORIGIN = 'http://localhost:5173';
const User = require('../src/models/UserModel');
const Tour = require('../src/models/TourModel');
const pool = require('../src/config/db');
const { getPortalConfig } = require('../src/config/authPortal');

// Chặn mọi truy vấn thực trong file này. HTTP/router/middleware/JWT vẫn chạy code thật.
pool.query = async () => { throw new Error('HTTP test không được truy cập DB thật.'); };
pool.getConnection = async () => { throw new Error('HTTP test không được mở connection thật.'); };
const app = require('../src/app');
let server, base;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

/** Gắn repository giả theo từng test; token thật xác định đúng tài khoản và quyền hiện tại. */
function fixtures(t, staffPermissions = ['tours.read']) {
  const users = {
    '1': { id: '1', full_name: 'Admin', role: 'admin', status: 'active' },
    '2': { id: '2', full_name: 'Staff', role: 'staff', status: 'active' },
    '3': { id: '3', full_name: 'Customer', role: 'customer', status: 'active' },
    '4': { id: '4', full_name: 'Banned', role: 'customer', status: 'banned' }
  };
  t.mock.method(User, 'findById', async (id) => users[id] ? { ...users[id] } : undefined);
  t.mock.method(User, 'permissionsFor', async () => staffPermissions);
  return users;
}

/** Tạo token thử nghiệm cùng issuer/audience/algorithm mà ứng dụng yêu cầu. */
function token(id) {
  const portal = ['1', '2'].includes(id) ? 'operations' : 'customer';
  const config = getPortalConfig(portal);
  return jwt.sign({ portal }, config.secret, { subject: id, issuer: config.issuer, audience: config.audience, algorithm: 'HS256', expiresIn: '1h' });
}

/** Gọi API trên cổng tạm để kiểm tra kết quả sau toàn bộ middleware. */
async function request(path, { id, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(id ? { Authorization: `Bearer ${token(id)}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

test('Guest xem danh sách, chi tiết và lịch mà không cần đăng nhập', async (t) => {
  let authReads = 0;
  t.mock.method(User, 'findById', async () => { authReads++; throw new Error('Guest không cần auth.'); });
  t.mock.method(Tour, 'list', async (filter, manage) => {
    assert.equal(manage, false);
    assert.equal(filter.q, 'biển');
    return { data: [{ id: '10', title: 'Tour biển', status: 'active' }], meta: { page: 1, total: 1 } };
  });
  t.mock.method(Tour, 'publicDetail', async () => ({ id: '10', images: [], itineraries: [], schedules: [] }));
  t.mock.method(Tour, 'publicScheduleList', async () => []);
  assert.equal((await request('/tours?q=bi%E1%BB%83n')).status, 200);
  assert.equal((await request('/tours/tour-bien')).status, 200);
  assert.equal((await request('/tours/tour-bien/schedules')).status, 200);
  // Token cũ/hỏng không biến trang công khai thành trang yêu cầu đăng nhập.
  assert.equal((await request('/tours/tour-bien', { headers: { Authorization: 'Bearer invalid' } })).status, 200);
  assert.equal(authReads, 0);
});

test('quản trị trả 401 cho Guest/token Customer và 403 cho Staff thiếu quyền, không gọi thao tác ghi', async (t) => {
  fixtures(t);
  let writes = 0;
  t.mock.method(Tour, 'create', async () => { writes++; });
  assert.equal((await request('/manage/tours')).status, 401);
  assert.equal((await request('/manage/tours', { id: '3', method: 'POST', body: {} })).status, 401);
  assert.equal((await request('/manage/users', { id: '2' })).status, 403);
  assert.equal(writes, 0);
});

test('Staff chỉ đọc được tour khi có quyền và không tự có quyền ghi/lịch nội bộ', async (t) => {
  fixtures(t, ['tours.read']);
  t.mock.method(Tour, 'list', async () => ({ data: [], meta: { total: 0 } }));
  t.mock.method(Tour, 'manageDetail', async (id, includeSchedules) => {
    assert.equal(includeSchedules, false);
    return { id, schedules: [] };
  });
  assert.equal((await request('/manage/tours', { id: '2' })).status, 200);
  assert.equal((await request('/manage/tours/10', { id: '2' })).status, 200);
  assert.equal((await request('/manage/tours', { id: '2', method: 'POST', body: {} })).status, 403);
  assert.equal((await request('/manage/tours/10/schedules', { id: '2' })).status, 403);
});

test('Admin tạo tour qua validator, actor lấy từ token; Staff đủ quyền có thể sửa', async (t) => {
  fixtures(t, ['tours.write']);
  t.mock.method(Tour, 'create', async (data, actor) => {
    assert.equal(actor, '1');
    assert.equal(data.slug, 'tour-moi');
    return { id: '10', ...data };
  });
  t.mock.method(Tour, 'update', async (id, data) => ({ id, ...data }));
  const created = await request('/manage/tours', { id: '1', method: 'POST', body: { title: 'Tour mới', duration_days: 3, base_price: '123.45' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.base_price, '123.45');
  assert.equal((await request('/manage/tours/10', { id: '2', method: 'PATCH', body: { status: 'hidden' } })).status, 200);
  assert.equal((await request('/manage/tours', { id: '1', method: 'POST', body: { title: 'Tour', created_by: 2 } })).status, 400);
});

test('token còn hạn của tài khoản bị khóa vẫn trả 401; /me không nhận ID người khác', async (t) => {
  fixtures(t);
  assert.equal((await request('/auth/me', { id: '4' })).status, 401);
  const own = await request('/auth/me?user_id=1', { id: '3' });
  assert.equal(own.status, 200);
  assert.equal(own.body.data.id, '3');
  assert.equal((await request('/auth/me', { id: '3', method: 'PATCH', body: { role: 'admin' } })).status, 400);
});

test('Admin đọc định nghĩa quyền; từ chối cấp khóa quyền ngoài whitelist', async (t) => {
  fixtures(t);
  const definitions = await request('/manage/users/permissions', { id: '1' });
  assert.equal(definitions.status, 200);
  assert.ok(definitions.body.data.some((item) => item.key === 'tours.write'));
  assert.equal((await request('/manage/users/2/permissions', { id: '1', method: 'PUT', body: { permissions: ['vendor.manage'] } })).status, 400);
});

test('CORS cho frontend đã cấu hình, chặn origin lạ và trả JSON cho lỗi parse/404', async () => {
  const allowed = await request('/missing', { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(allowed.status, 404);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await request('/missing', { headers: { Origin: 'https://unexpected.example' } })).status, 403);
  const invalid = await fetch(base + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).message, /JSON/);
});

test('readiness trả 503 khi DB không sẵn sàng, không báo thành công giả', async () => {
  assert.equal((await request('/health')).status, 503);
});
