const { validateEnvironment } = require('./config/env');
const pool = require('./config/db');

/** Chỉ mở HTTP sau khi cấu hình và MySQL hợp lệ; không seed hay migrate tự động. */
async function startServer() {
  validateEnvironment();
  await pool.query('SELECT 1');
  const app = require('./app');
  const port = Number(process.env.PORT || 5000);
  const server = app.listen(port, () => {
    console.log(`Backend đang chạy tại http://localhost:${port}`);
  });

  /** Ngừng nhận yêu cầu mới và giải phóng pool khi người dùng dừng server. */
  async function shutdown() {
    const timer = setTimeout(() => process.exit(1), 10000);
    timer.unref();
    server.close(async () => {
      await pool.end();
      clearTimeout(timer);
      process.exit(0);
    });
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.once('error', (error) => {
    console.error(`Không thể mở HTTP server (${error.code || error.name}).`);
    pool.end().finally(() => { process.exitCode = 1; });
  });
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    // Lỗi cấu hình do ứng dụng tạo là an toàn; lỗi driver chỉ công bố mã lỗi.
    const detail = error.code ? error.code : error.message;
    console.error(`Không thể khởi động backend: ${detail}`);
    pool.end().finally(() => { process.exitCode = 1; });
  });
}

module.exports = { startServer };
