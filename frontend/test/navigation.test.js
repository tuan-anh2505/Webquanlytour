import test from 'node:test';
import assert from 'node:assert/strict';
import { safeReturnTo, bookingPath } from '../src/services/navigation.js';

test('đường dẫn tiếp tục chỉ chấp nhận trang nội bộ an toàn', () => {
  for (const value of ['https://example.com', '//example.com', '/\\example.com', '/login?next=/', '/register', '/\nexample.com', null]) assert.equal(safeReturnTo(value), '/account');
  assert.equal(safeReturnTo('/booking/start?tour=1&schedule=2'), '/booking/start?tour=1&schedule=2');
});

test('giữ tour và lịch khởi hành sau đăng nhập mà không mất BIGINT', () => {
  const path = bookingPath('9007199254740993', '12');
  assert.equal(path, '/booking/start?tour=9007199254740993&schedule=12');
});
