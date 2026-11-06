const { test } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/db');
const Booking = require('../src/models/BookingModel');
const Content = require('../src/models/ContentModel');
const Operations = require('../src/models/OperationsModel');
const validate = require('../src/validators/siteValidator');
const seo = require('../src/services/seoService');
pool.query = pool.getConnection = async () => { throw new Error('Test không được truy cập DB thật.'); };

test('validator chặn field đặc quyền, ngày sai và rating ngoài giới hạn', () => {
  assert.throws(() => validate.article({ title: 'Bài', content: 'Text', author_id: 1 }), { status: 400 });
  assert.throws(() => validate.review({ rating: 6, comment: '' }), { status: 400 });
  assert.throws(() => validate.review({ rating: 5, status: 'published' }), { status: 400 });
  assert.throws(() => validate.trip({ booked_seats: 0 }), { status: 400 });
  assert.throws(() => validate.guide({ full_name: 'A', role: 'admin' }), { status: 400 });
  for (const query of [{ from: '2030-13-01' }, { from: '2030-02-30' }, { from: '2020-01-01', to: '2030-01-01' }, { page: ['1'] }]) {
    assert.throws(() => 'page' in query ? validate.list(query) : validate.dateRange(query), { status: 400 });
  }
  assert.equal(validate.article({ title: 'Kinh nghiệm Đà Nẵng', content: 'Nội dung' }).slug, 'kinh-nghiem-da-nang');
});

test('Guest search chỉ có published, truy vấn tham số và không chọn toàn bộ nội dung list', async t => {
  const calls = [];
  t.mock.method(pool, 'query', async (sql, params) => { calls.push({ sql, params }); return sql.includes('COUNT(*)') ? [[{ total: 0 }]] : [[]]; });
  const q = "%' OR 1=1 --";
  await Content.articles({ page: 1, limit: 10, q });
  for (const call of calls) { assert.match(call.sql, /a.status='published'/); assert.match(call.sql, /published_at<=CURRENT_TIMESTAMP/); assert.ok(!call.sql.includes(q)); assert.ok(call.params.includes(`%${q}%`)); }
  assert.ok(!calls[1].sql.includes('SELECT a.*'));
});

test('bài ẩn trả404 ngay cả biết slug, chưa đọc nội dung tiếp theo', async t => {
  let sql;
  t.mock.method(pool, 'query', async text => { sql = text; return [[]]; });
  await assert.rejects(Content.article('hidden-article'), { status: 404 });
  assert.match(sql, /status='published'/);
});

test('dashboard Staff không đọc dữ liệu thanh toán/user khi thiếu quyền', async t => {
  const calls = [];
  t.mock.method(pool, 'query', async sql => { calls.push(sql); return sql.includes('COUNT(*) AS total,') ? [[{ total: 0, pending: 0 }]] : [[]]; });
  const result = await Operations.dashboard({ role: 'staff', permissions: ['dashboard.read', 'bookings.read'] }, { from: '2030-01-01', to: '2030-01-31' });
  assert.ok(result.metrics.bookings);
  assert.equal(result.metrics.payments, undefined);
  assert.equal(result.metrics.customers, undefined);
  assert.ok(!calls.some(sql => /FROM payments|FROM refunds|FROM users/.test(sql)));
});

test('khách chưa hoàn thành tour không được ghi review dù body có điểm hợp lệ', async t => {
  const queries = [];
  t.mock.method(Booking, 'transaction', async work => work({ query: async sql => { queries.push(sql); return sql.startsWith('SELECT id FROM tours') ? [[{ id: '1' }]] : [[]]; } }));
  await assert.rejects(Content.saveReview('1', '3', { rating: 5, comment: 'Test' }), { status: 403 });
  assert.ok(!queries.some(sql => sql.startsWith('INSERT INTO reviews')));
  assert.ok(queries.some(sql => sql.includes("b.status='completed'")));
});

test('review đủ điều kiện luôn pending, không cho khách xuất bản trực tiếp', async t => {
  const writes = [];
  t.mock.method(Booking, 'transaction', async work => work({ query: async (sql, params) => {
    if (sql.startsWith('SELECT id FROM tours')) return [[{ id: '1' }]];
    if (sql.includes('FROM bookings b')) return [[{ id: '20' }]];
    if (sql.startsWith('SELECT id,rating')) return [[{ id: '7', status: 'pending' }]];
    writes.push({ sql, params }); return [{ affectedRows: 1 }];
  } }));
  assert.equal((await Content.saveReview('1', '3', { rating: 4, comment: 'An toàn' })).status, 'pending');
  assert.match(writes[0].sql, /status='pending'/);
  assert.deepEqual(writes[0].params, ['3', '1', 4, 'An toàn']);
});

test('yêu thích bỏ đúng quan hệ của Customer, không xóa tour hoặc người khác', async t => {
  const calls = [];
  t.mock.method(pool, 'query', async (sql, params) => { calls.push({ sql, params }); return [{ affectedRows: 1 }]; });
  await Content.setWishlist('1', '3', false);
  assert.match(calls[0].sql, /DELETE FROM wishlists WHERE customer_id=\? AND tour_id=\?/);
  assert.deepEqual(calls[0].params, ['3', '1']);
});

test('hoàn thành chuyến tương lai bị chặn cả khi MySQL trả chuỗi 0', async t => {
  let writes = 0;
  t.mock.method(Booking, 'withLockedSchedule', async (id, work) => work({ schedule: { status: 'open' }, tour: { duration_days: 3 }, connection: { query: async sql => { if (!sql.startsWith('SELECT')) writes++; return [[{ finished: '0' }]]; } } }));
  await assert.rejects(Operations.completeTrip('7', '1'), { status: 409 });
  assert.equal(writes, 0);
});

test('guide trùng lịch trả409 trước khi thay đổi phân công và khóa guide trước truy vấn xung đột', async t => {
  const calls = [];
  t.mock.method(pool, 'query', async () => [[{ tour_id: '1' }]]);
  t.mock.method(Booking, 'transaction', async work => work({ query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT * FROM guides')) return [[{ id: '2', status: 'active' }]];
    if (sql.startsWith('SELECT id,duration_days')) return [[{ id: '1', duration_days: 3 }]];
    if (sql.startsWith('SELECT * FROM tour_schedules')) return [[{ id: '7', status: 'open', departure_date: '2030-02-01 08:00:00' }]];
    if (sql.startsWith('SELECT sg.schedule_id')) return [[{ schedule_id: '8' }]];
    throw new Error('Không được ghi khi trùng lịch.');
  } }));
  await assert.rejects(Operations.assignGuide('7', '2', true), { status: 409 });
  assert.match(calls[0].sql, /guides.*FOR UPDATE/);
  assert.equal(calls.find(row => row.sql.startsWith('SELECT sg.schedule_id')).params[2], '2030-02-04 00:00:00');
});

test('Customer trip chỉ có booking chính chủ confirmed/completed, không select notes/manifest', async t => {
  const queries = [];
  t.mock.method(pool, 'query', async (sql, params) => { queries.push({ sql, params }); return [[]]; });
  await assert.rejects(Operations.customerTrip('7', '3'), { status: 404 });
  assert.match(queries[0].sql, /b.customer_id=\?/);
  assert.match(queries[0].sql, /confirmed','completed/);
  assert.ok(!queries[0].sql.includes('s.notes'));
});

test('SEO escape HTML/JSON-LD và giữ noindex cho trang riêng', () => {
  const html = seo.render('<html><head><title>Old</title></head><body><div id="root"></div></body></html>', { title: '<script>alert(1)</script>', description: '" onload="evil', canonical: 'https://example.com/x', index: false, data: { text: '</script><script>evil</script>' } });
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /noindex,nofollow/);
  assert.ok(!html.includes('</script><script>evil'));
  assert.match(html, /\\u003c/);
});
