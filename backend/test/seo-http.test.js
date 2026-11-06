const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
process.env.SERVE_FRONTEND = 'true';
process.env.SITE_URL = 'https://tour.example';
const Tour = require('../src/models/TourModel');
const Content = require('../src/models/ContentModel');
const pool = require('../src/config/db');
pool.query = pool.getConnection = async () => { throw new Error('SEO test không được truy cập DB thật.'); };
const app = require('../src/app');
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
function fixture(t) {
  t.mock.method(fs, 'readFile', async () => '<html><head><title>Default</title></head><body><div id="root"></div></body></html>');
  t.mock.method(Tour, 'company', async () => ({ company_name: 'Công ty Tour', introduction: 'Du lịch' }));
}

test('nguồn HTML bài viết có title/description/canonical và nội dung trước khi chạy JS', async t => {
  fixture(t);
  t.mock.method(Content, 'article', async () => ({ slug: 'bai-viet', title: 'Bài viết mới', content: 'Nội dung công khai', author_name: 'Tác giả', published_at: '2030-01-01 08:00:00' }));
  const res = await fetch(base + '/articles/bai-viet');
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /Bài viết mới \| Công ty Tour/);
  assert.match(html, /https:\/\/tour.example\/articles\/bai-viet/);
  assert.match(html, /Nội dung công khai/); assert.match(html, /application\/ld\+json/);
});

test('trang riêng được noindex và không có nội dung booking trong HTML ban đầu', async t => {
  fixture(t);
  const res = await fetch(base + '/account');
  const html = await res.text();
  assert.equal(res.status, 200); assert.match(html, /noindex,nofollow/);
  assert.match(html, /<div id="root"><\/div>/);
});

test('API không tồn tại vẫn trả JSON404, không bị SPA nuốt thành HTML200', async () => {
  const res = await fetch(base + '/api/unknown-endpoint');
  assert.equal(res.status, 404); assert.match(res.headers.get('content-type'), /application\/json/);
});

test('sitemap chỉ chọn nội dung công khai và không có API/quản trị', async t => {
  const queries = [];
  t.mock.method(pool, 'query', async sql => { queries.push(sql); return [[{ slug: sql.includes('FROM tours') ? 'tour-public' : 'bai-public', updated_at: '2030-01-01 08:00:00' }]]; });
  const res = await fetch(base + '/sitemap.xml'); const xml = await res.text();
  assert.equal(res.status, 200); assert.match(xml, /tour-public/); assert.match(xml, /bai-public/);
  assert.ok(!xml.includes('/admin')); assert.ok(!xml.includes('/api/'));
  assert.match(queries[0], /status='active'/); assert.match(queries[1], /status='published'/);
});
