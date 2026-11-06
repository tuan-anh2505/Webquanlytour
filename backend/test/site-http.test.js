const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'phase3-tests-secret-at-least-thirty-two-bytes';
process.env.INTERNAL_JWT_SECRET = 'phase3-operations-secret-not-same-customer-key';
process.env.INTERNAL_ALLOWED_IPS = '127.0.0.1,::1';
const pool = require('../src/config/db');
const User = require('../src/models/UserModel');
const Content = require('../src/models/ContentModel');
const Operations = require('../src/models/OperationsModel');
const Notification = require('../src/models/NotificationModel');
const { getPortalConfig } = require('../src/config/authPortal');
pool.query = pool.getConnection = async () => { throw new Error('HTTP test không được đọc/ghi DB thật.'); };
const app = require('../src/app');
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}/api`; });
after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
function setup(t, permissions = []) {
  t.mock.method(User, 'findById', async id => ({ id, role: id === '1' ? 'admin' : id === '2' ? 'staff' : 'customer', status: 'active' }));
  t.mock.method(User, 'permissionsFor', async () => permissions);
}
function token(id, portal) { const config = getPortalConfig(portal); return jwt.sign({ portal }, config.secret, { subject: id, issuer: config.issuer, audience: config.audience, algorithm: 'HS256', expiresIn: '1h' }); }
async function request(route, { id, portal = 'customer', method = 'GET', body } = {}) {
  const response = await fetch(base + route, { method, headers: { ...(id ? { Authorization: `Bearer ${token(id,portal)}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}

test('Guest đọc bài viết và review, không bị customer middleware chặn nhầm', async t => {
  t.mock.method(Content, 'articles', async () => ({ data: [] }));
  t.mock.method(Content, 'article', async () => ({ id: '7', title: 'Public' }));
  t.mock.method(Content, 'reviews', async () => ({ data: [], summary: { total: 0 } }));
  assert.equal((await request('/articles')).status, 200);
  assert.equal((await request('/articles/public-story')).status, 200);
  assert.equal((await request('/tours/1/reviews')).status, 200);
  assert.equal((await request('/wishlist')).status, 401);
  assert.equal((await request('/notifications')).status, 401);
});

test('phiên vận hành không đọc dữ liệu riêng Customer và ngược lại', async t => {
  setup(t);
  assert.equal((await request('/wishlist', { id: '1', portal: 'operations' })).status, 401);
  assert.equal((await request('/manage/articles', { id: '3' })).status, 401);
});

test('Staff thiếu quyền bị403 trước khi gọi thao tác quản lý nội dung', async t => {
  setup(t, ['articles.read']);
  t.mock.method(Content, 'articles', async () => ({ data: [] }));
  assert.equal((await request('/manage/articles', { id: '2', portal: 'operations' })).status, 200);
  assert.equal((await request('/manage/articles', { id: '2', portal: 'operations', method: 'POST', body: {} })).status, 403);
  assert.equal((await request('/manage/dashboard', { id: '2', portal: 'operations' })).status, 403);
  assert.equal((await request('/manage/guides', { id: '2', portal: 'operations' })).status, 403);
});

test('Admin tạo bài gắn đúng tác giả; không nhận author_id do client gán', async t => {
  setup(t);
  t.mock.method(Content, 'saveArticle', async (id, data, authorId) => { assert.equal(authorId, '1'); assert.equal(data.slug, 'bai-moi'); return { id: '8', ...data }; });
  assert.equal((await request('/manage/articles', { id: '1', portal: 'operations', method: 'POST', body: { title: 'Bài mới', content: 'Văn bản' } })).status, 201);
  assert.equal((await request('/manage/articles', { id: '1', portal: 'operations', method: 'POST', body: { title: 'Bài mới', content: 'Text', author_id: '2' } })).status, 400);
});

test('Customer viết review không được gán trạng thái hoặc customer_id', async t => {
  setup(t);
  t.mock.method(Content, 'saveReview', async (tourId, userId, body) => { assert.equal(userId, '3'); return { id: '1', status: 'pending', ...body }; });
  assert.equal((await request('/tours/1/review', { id: '3', method: 'PUT', body: { rating: 5, comment: 'Rất tốt' } })).body.data.status, 'pending');
  assert.equal((await request('/tours/1/review', { id: '3', method: 'PUT', body: { rating: 5, status: 'published' } })).status, 400);
  assert.equal((await request('/manage/reviews/1', { id: '3', method: 'PATCH', body: { status: 'published' } })).status, 401);
});

test('yêu thích và đọc thông báo chỉ dùng user ID từ token', async t => {
  setup(t);
  t.mock.method(Content, 'setWishlist', async (tourId, userId, value) => { assert.equal(userId, '3'); assert.equal(tourId, '7'); return { saved: value }; });
  t.mock.method(Notification, 'markRead', async (userId, notificationId) => { assert.equal(userId, '3'); assert.equal(notificationId, '8'); return { read: true }; });
  assert.equal((await request('/wishlist/7?customer_id=1', { id: '3', method: 'PUT', body: {} })).body.data.saved, true);
  assert.equal((await request('/wishlist/7', { id: '3', method: 'DELETE' })).body.data.saved, false);
  assert.equal((await request('/notifications/8/read?user_id=1', { id: '3', method: 'PATCH', body: {} })).status, 200);
});

test('trip manifest chỉ được yêu cầu khi Staff có bookings.read', async t => {
  setup(t, ['trips.read']);
  t.mock.method(Operations, 'trip', async (id, manifest) => { assert.equal(manifest, false); return { id, manifest: [] }; });
  assert.equal((await request('/manage/trips/7', { id: '2', portal: 'operations' })).status, 200);
});

test('cập nhật chuyến không thể sửa chỗ/giá, hoàn thành cần hai quyền', async t => {
  setup(t, ['trips.write']);
  assert.equal((await request('/manage/trips/7', { id: '2', portal: 'operations', method: 'PATCH', body: { booked_seats: 0 } })).status, 400);
  assert.equal((await request('/manage/trips/7/complete', { id: '2', portal: 'operations', method: 'POST', body: {} })).status, 403);
});

test('phân công không chấp nhận is_lead sai kiểu và guide role giả', async t => {
  setup(t);
  assert.equal((await request('/manage/trips/7/guides', { id: '1', portal: 'operations', method: 'POST', body: { guide_id: '2', is_lead: 'true' } })).status, 400);
  assert.equal((await request('/manage/guides', { id: '1', portal: 'operations', method: 'POST', body: { full_name: 'Guide', role: 'admin' } })).status, 400);
});
