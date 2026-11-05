import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, customerApi, operationsApi, getToken, saveToken, clearLegacySession } from '../src/services/api.js';

let values, calls, events;
beforeEach(() => {
  values = new Map(); calls = []; events = [];
  global.sessionStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  global.window = { dispatchEvent: event => events.push(event.type) };
  global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ data: [] }) }; };
});

test('JWT hai cổng được lưu/xóa độc lập, phiên cũ dùng chung bị loại bỏ', () => {
  saveToken('customer-token'); saveToken('ops-token', 'operations');
  values.set('webquanlytour.token', 'legacy'); clearLegacySession();
  assert.equal(values.has('webquanlytour.token'), false);
  assert.equal(getToken(), 'customer-token'); assert.equal(getToken('operations'), 'ops-token');
  saveToken(null, 'operations');
  assert.equal(getToken(), 'customer-token'); assert.equal(getToken('operations'), null);
});

test('API khách và API quản trị không gửi lẫn token', async () => {
  saveToken('customer-token'); saveToken('ops-token', 'operations');
  await customerApi.get('/auth/me');
  await operationsApi.get('/auth/me');
  await api.get('/manage/tours');
  await api.get('/tours');
  assert.deepEqual(calls.map(call => call.url), ['/api/auth/me', '/api/operations/auth/me', '/api/manage/tours', '/api/tours']);
  assert.deepEqual(calls.map(call => call.options.headers.Authorization), ['Bearer customer-token', 'Bearer ops-token', 'Bearer ops-token', 'Bearer customer-token']);
});

test('thiếu token vận hành không fallback sang token Customer', async () => {
  saveToken('customer-token');
  await api.get('/manage/users');
  assert.equal(calls[0].options.headers.Authorization, undefined);
});

test('401 của cổng vận hành chỉ báo hết phiên vận hành', async () => {
  saveToken('customer-token'); saveToken('ops-token', 'operations');
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'Phiên không hợp lệ.' }) });
  await assert.rejects(operationsApi.get('/auth/me'), { status: 401 });
  assert.deepEqual(events, ['auth:expired:operations']);
  assert.equal(getToken(), 'customer-token');
});

test('Idempotency-Key được gửi lại nguyên vẹn, caller không ghi đè token cổng', async () => {
  saveToken('customer-token'); saveToken('ops-token', 'operations');
  const key = '3cae9883-82a2-4ca2-b176-f975d27d001e';
  await api.post('/bookings', { schedule_id: '1' }, { headers: { 'Idempotency-Key': key, Authorization: 'Bearer ops-token' } });
  assert.equal(calls[0].options.headers['Idempotency-Key'], key);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer customer-token');
  await operationsApi.post('/manage/bookings/1/confirm', {}, { headers: { Authorization: 'Bearer customer-token' } });
  assert.equal(calls[1].options.headers.Authorization, 'Bearer ops-token');
});
