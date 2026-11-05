const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInternalAllowList } = require('../src/config/internalAccess');
const { createInternalNetworkGuard } = require('../src/middlewares/internalAccess');

/** Mô phỏng response để kiểm tra mạng nội bộ mà không mở cổng/đọc dữ liệu người dùng. */
function response() {
  return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test('chỉ IP/CIDR được cấp mới đi tiếp, hỗ trợ IPv4-mapped và IPv6', () => {
  const guard = createInternalNetworkGuard(buildInternalAllowList('127.0.0.1,10.20.0.0/16,::1'));
  let allowed = 0;
  for (const ip of ['127.0.0.1', '::ffff:127.0.0.1', '10.20.8.2', '::1']) guard({ ip }, response(), () => { allowed++; });
  assert.equal(allowed, 4);
  const denied = response();
  guard({ ip: '203.0.113.4', headers: { 'x-forwarded-for': '127.0.0.1' } }, denied, () => { allowed++; });
  assert.equal(denied.code, 404);
  assert.equal(allowed, 4);
});

test('từ chối allowlist rỗng, sai địa chỉ hoặc CIDR vượt giới hạn', () => {
  for (const value of [',', 'any', '127.0.0.1/33', '::1/129', '10.0.0.1/x', '10.0.0.1/8/8']) {
    assert.throws(() => buildInternalAllowList(value));
  }
});
