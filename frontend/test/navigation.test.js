import test from 'node:test';
import assert from 'node:assert/strict';
import { safeReturnTo, bookingPath, safeOperationsReturnTo } from '../src/services/navigation.js';
import { operationsLoginPath } from '../src/services/portalConfig.js';

test('đường dẫn tiếp tục chỉ chấp nhận trang nội bộ an toàn', () => {
  for (const value of ['https://example.com', '//example.com', '/\\example.com', '/login?next=/', '/register', '/\nexample.com', null]) assert.equal(safeReturnTo(value), '/account');
  assert.equal(safeReturnTo('/booking/start?tour=1&schedule=2'), '/booking/start?tour=1&schedule=2');
});

test('giữ tour và lịch khởi hành sau đăng nhập mà không mất BIGINT', () => {
  const path = bookingPath('9007199254740993', '12');
  assert.equal(path, '/booking/start?tour=9007199254740993&schedule=12');
});

test('cổng vận hành chỉ quay lại khu vực quản trị', () => {
  for (const value of ['/account', '/login', 'https://example.com', '//example.com', '/administrator']) assert.equal(safeOperationsReturnTo(value), '/admin');
  assert.equal(safeOperationsReturnTo('/admin/tours?page=2'), '/admin/tours?page=2');
});

test('đường dẫn đăng nhập vận hành không nhận URL ngoài hay trùng trang khách', () => {
  assert.equal(operationsLoginPath('/staff/access-7f3'), '/staff/access-7f3');
  for (const value of ['https://evil.example', '//example.com', '/login', '/register', '/admin', '/admin/tours', '/ops?x=1']) assert.equal(operationsLoginPath(value), '/operations/sign-in');
});
