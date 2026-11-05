const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter, securityHeaders } = require('../src/middlewares/security');
const { errorHandler } = require('../src/middlewares/errorHandler');

/** Response tối thiểu để kiểm thử hành vi middleware mà không mở cổng hay kết nối DB. */
function response() {
  return {
    headers: {}, statusCode: 200,
    set(key, value) { if (typeof key === 'object') Object.assign(this.headers, key); else this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('giới hạn IP độc lập và mở lại sau khi cửa sổ kết thúc', () => {
  let time = 1000;
  const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => time });
  let allowed = 0;
  const pass = () => { allowed += 1; };
  limiter({ ip: 'a' }, response(), pass);
  limiter({ ip: 'a' }, response(), pass);
  const blocked = response();
  limiter({ ip: 'a' }, blocked, pass);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['Retry-After'], '1');
  limiter({ ip: 'b' }, response(), pass);
  assert.equal(allowed, 3);
  time += 1000;
  limiter({ ip: 'a' }, response(), pass);
  assert.equal(allowed, 4);
});

test('header API tắt cache và cấp request ID riêng cho mỗi yêu cầu', () => {
  const first = {}, second = {}, res = response();
  securityHeaders(first, res, () => {});
  securityHeaders(second, response(), () => {});
  assert.match(first.requestId, /^[\da-f-]{36}$/);
  assert.notEqual(first.requestId, second.requestId);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
});

test('lỗi MySQL trùng dữ liệu trả 409 và không lộ SQL/chi tiết driver', () => {
  const res = response();
  errorHandler(Object.assign(new Error('secret SQL and password'), { code: 'ER_DUP_ENTRY' }), {}, res, () => {});
  assert.equal(res.statusCode, 409);
  assert.doesNotMatch(JSON.stringify(res.body), /secret|password|SQL/);
});

test('JSON hỏng trả 400 và lỗi ràng buộc trả 400', () => {
  const invalid = response();
  errorHandler(Object.assign(new Error('raw input'), { type: 'entity.parse.failed' }), {}, invalid, () => {});
  assert.equal(invalid.statusCode, 400);
  const constraint = response();
  errorHandler(Object.assign(new Error('internal SQL'), { code: 'ER_CHECK_CONSTRAINT_VIOLATED' }), {}, constraint, () => {});
  assert.equal(constraint.statusCode, 400);
});
