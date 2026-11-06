/** Tái sử dụng scheduler không chạy chồng; SMTP không giữ transaction nghiệp vụ. */
function createMailJob(options = {}) {
  let stopping = false;
  const scheduler = require('./bookingExpiryJob').createBookingExpiryJob({
    expire: () => require('../services/mailService').flush({ limit: 10, shouldStop: () => stopping }),
    intervalMs: Number(process.env.MAIL_INTERVAL_MS || 15000),
    onError: error => console.error(JSON.stringify({ job: 'mail-delivery', code: error.code || error.name })),
    ...options
  });
  return {
    start() { stopping = false; scheduler.start(); },
    tick: scheduler.tick,
    async stop() { stopping = true; await scheduler.stop(); }
  };
}
module.exports = { createMailJob };
