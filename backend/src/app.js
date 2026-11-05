require('./config/env');
const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const { getAllowedOrigins } = require('./config/env');
const { securityHeaders, createRateLimiter } = require('./middlewares/security');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const { publicRouter, manageRouter } = require('./routes/tourRoutes');

// Tách ứng dụng khỏi listen để kiểm thử HTTP mà không khởi động server của người dùng.
const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors({
  origin(origin, callback) {
    if (!origin || getAllowedOrigins().includes(origin)) return callback(null, true);
    const error = new Error('Origin không được phép truy cập API.');
    error.status = 403;
    callback(error);
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '256kb' }));

/** Kiểm tra tiến trình nhận yêu cầu; dùng /api/health để kiểm tra thêm MySQL. */
app.get('/', (req, res) => res.json({ message: 'Chào mừng đến với API Quản lý Tour!' }));

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
app.use('/api/manage/users', userRoutes);
app.use('/api', publicRouter);
app.use('/api/manage', manageRouter);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
