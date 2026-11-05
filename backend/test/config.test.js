const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateEnvironment } = require('../src/config/env');

/** Thay cấu hình trong phạm vi test; luôn phục hồi, không ghi file .env hiện hữu. */
function environment(t, overrides = {}) {
  const values = {
    DB_HOST: 'localhost', DB_USER: 'test', DB_NAME: 'test',
    JWT_SECRET: 'test-secret-with-at-least-thirty-two-bytes',
    PUBLIC_ORIGIN: 'http://localhost:5173', JWT_EXPIRES_IN: '8h',
    PORT: '5000', DB_PORT: '3306', DB_TIMEZONE: '+07:00', ...overrides
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('cấu hình hợp lệ chấp nhận nhiều frontend và thời lượng JWT có đơn vị', (t) => {
  environment(t, { PUBLIC_ORIGIN: 'http://localhost:5173,https://tour.example', JWT_EXPIRES_IN: '30m' });
  assert.doesNotThrow(validateEnvironment);
});

test('từ chối thời lượng JWT sai trước khi có thể tạo tài khoản', (t) => {
  environment(t);
  for (const value of ['abc', '0h', '-1h', '3600', '1y']) {
    process.env.JWT_EXPIRES_IN = value;
    assert.throws(validateEnvironment, /JWT_EXPIRES_IN/);
  }
});

test('không khởi động với origin rỗng, origin có path, secret yếu hoặc cổng sai', (t) => {
  environment(t);
  for (const value of [',', 'https://tour.example/path', 'file:///tmp']) {
    process.env.PUBLIC_ORIGIN = value;
    assert.throws(validateEnvironment);
  }
  process.env.PUBLIC_ORIGIN = 'http://localhost:5173';
  process.env.JWT_SECRET = 'short';
  assert.throws(validateEnvironment, /JWT_SECRET/);
  process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-bytes';
  process.env.PORT = '0';
  assert.throws(validateEnvironment, /PORT/);
});

test('không cho múi giờ DB lệch với lịch khởi hành giờ Việt Nam', (t) => {
  environment(t, { DB_TIMEZONE: '+00:00' });
  assert.throws(validateEnvironment, /DB_TIMEZONE/);
});
