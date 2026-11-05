const { randomUUID } = require('node:crypto');

/** Thêm mã theo dõi yêu cầu và các header bảo vệ cơ bản cho API JSON. */
function securityHeaders(req, res, next) {
  req.requestId = randomUUID();
  res.set({
    'X-Request-ID': req.requestId,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store'
  });
  next();
}

/** Giới hạn thử đăng nhập/đăng ký theo IP trong một tiến trình; không lưu dữ liệu vào DB. */
function createRateLimiter({ max, windowMs, now = Date.now }) {
  const entries = new Map();
  return function limitRequests(req, res, next) {
    const timestamp = now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let entry = entries.get(key);
    if (!entry || entry.expiresAt <= timestamp) {
      entry = { count: 0, expiresAt: timestamp + windowMs };
      entries.set(key, entry);
    }
    entry.count += 1;
    const remainingSeconds = Math.max(1, Math.ceil((entry.expiresAt - timestamp) / 1000));
    res.set({ 'RateLimit-Limit': String(max), 'RateLimit-Remaining': String(Math.max(0, max - entry.count)), 'RateLimit-Reset': String(remainingSeconds) });
    // Thu hồi các mục hết hạn để tránh tăng bộ nhớ khi có nhiều địa chỉ truy cập.
    if (entries.size > 10000) {
      for (const [address, value] of entries) if (value.expiresAt <= timestamp) entries.delete(address);
      if (entries.size > 10000) entries.delete(entries.keys().next().value);
    }
    if (entry.count > max) {
      res.set('Retry-After', String(remainingSeconds));
      return res.status(429).json({ message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.' });
    }
    next();
  };
}

module.exports = { securityHeaders, createRateLimiter };
