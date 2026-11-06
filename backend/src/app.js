require('./config/env');
const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const { getAllowedOrigins } = require('./config/env');
const { createHash } = require('node:crypto');
const { getInternalAuthPath } = require('./config/internalAccess');
const { createInternalNetworkGuard } = require('./middlewares/internalAccess');
const { securityHeaders, createRateLimiter } = require('./middlewares/security');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const authRoutes = require('./routes/authRoutes');
const internalAuthRoutes = require('./routes/internalAuthRoutes');
const userRoutes = require('./routes/userRoutes');
const { publicRouter, manageRouter } = require('./routes/tourRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const siteRoutes = require('./routes/siteRoutes');

// Tách ứng dụng khỏi listen để kiểm thử HTTP mà không khởi động server của người dùng.
const app = express();
app.disable('x-powered-by');
// Chỉ tin proxy được khai báo cụ thể; mặc định bỏ qua X-Forwarded-For do client gửi.
if (process.env.TRUSTED_PROXY_CIDRS) {
  app.set('trust proxy', process.env.TRUSTED_PROXY_CIDRS.split(',').map(value => value.trim()).filter(Boolean));
}
app.use(securityHeaders);
app.use(cors({
  origin(origin, callback) {
    if (!origin || getAllowedOrigins().includes(origin)) return callback(null, true);
    const error = new Error('Origin không được phép truy cập API.');
    error.status = 403;
    callback(error);
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Payment-Signature']
}));
// Chữ ký webhook bao phủ byte nhận được, nên phải đọc raw trước JSON parser toàn cục.
app.use('/api/payments/webhook', express.raw({ type: 'application/json', limit: '64kb' }), paymentRoutes.webhookRouter);
app.use(express.json({ limit: '256kb' }));

/** Kiểm tra tiến trình nhận yêu cầu; dùng /api/health để kiểm tra thêm MySQL. */
app.get('/', (req, res, next) => process.env.SERVE_FRONTEND === 'true' ? next() : res.json({ message: 'Chào mừng đến với API Quản lý Tour!' }));

/** Readiness: chỉ truy vấn SELECT, trả 503 khi database không đáp ứng. */
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ data: { status: 'ok', database: 'connected' } });
  } catch {
    res.status(503).json({ message: 'Dịch vụ database chưa sẵn sàng.' });
  }
});

app.use('/api/auth/login', createRateLimiter({ max: 20, windowMs: 15 * 60 * 1000 }));
app.use('/api/auth/register', createRateLimiter({ max: 10, windowMs: 60 * 60 * 1000 }));
app.use('/api/auth', authRoutes);
const internalNetwork = createInternalNetworkGuard();
const internalPath = getInternalAuthPath();
app.use(internalPath, internalNetwork);
app.use(`${internalPath}/login`, createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 }));
app.use(`${internalPath}/login`, createRateLimiter({
  max: 8, windowMs: 15 * 60 * 1000,
  // Hash email để hạn chế đoán mật khẩu từ nhiều IP, không giữ email thuần trong bộ đếm.
  keyGenerator(req) {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email ? createHash('sha256').update(email).digest('hex') : `invalid:${req.ip}`;
  }
}));
app.use(internalPath, internalAuthRoutes);
app.use('/api/manage', internalNetwork);
app.use('/api/manage/users', userRoutes);
app.use('/api/bookings', paymentRoutes.bookingPaymentRouter);
app.use('/api/bookings', bookingRoutes.customerRouter);
app.use('/api/payments', paymentRoutes.customerRouter);
app.use('/api/manage/bookings', bookingRoutes.manageRouter);
app.use('/api/manage/payments', paymentRoutes.manageRouter);
app.use('/api', siteRoutes.publicRouter);
app.use('/api', siteRoutes.customerRouter);
app.use('/api/manage', siteRoutes.manageRouter);
app.use('/api', publicRouter);
app.use('/api/manage', manageRouter);
require('./services/seoService').attach(app);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
