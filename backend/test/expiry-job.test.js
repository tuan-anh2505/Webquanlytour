const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBookingExpiryJob } = require('../src/jobs/bookingExpiryJob');

test('job không chạy chồng và stop chờ lần đang xử lý kết thúc', async () => {
  let complete, calls = 0;
  const job = createBookingExpiryJob({ intervalMs: 100000, expire: async () => { calls++; await new Promise(resolve => { complete = resolve; }); } });
  job.start();
  await Promise.resolve();
  job.tick();
  assert.equal(calls, 1);
  let stopped = false;
  const stopping = job.stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  complete();
  await stopping;
  assert.equal(stopped, true);
  job.tick();
  assert.equal(calls, 1);
});

test('job báo lỗi và tiếp tục được ở tick sau, không làm rơi rejection', async () => {
  const errors = [];
  let calls = 0;
  const job = createBookingExpiryJob({ intervalMs: 100000, expire: async () => { calls++; if (calls === 1) throw new Error('temporary'); }, onError: error => errors.push(error.message) });
  job.start();
  await job.tick();
  assert.deepEqual(errors, ['temporary']);
  await job.tick();
  assert.equal(calls, 2);
  await job.stop();
});
