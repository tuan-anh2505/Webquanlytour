const { hkdfSync } = require('node:crypto');

/**
 * Chỉ bật cổng thanh toán mô phỏng trong môi trường phát triển/kiểm thử.
 * Production luôn tắt mock; kết nối cổng thu tiền thật cần adapter và cấu hình riêng.
 */
function getPaymentConfig() {
    const requested = process.env.PAYMENT_MODE || (process.env.NODE_ENV === 'production' ? 'disabled' : 'mock');
    const mode = process.env.NODE_ENV === 'production' || requested !== 'mock' ? 'disabled' : 'mock';
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || (process.env.JWT_SECRET ? Buffer.from(hkdfSync(
        'sha256', process.env.JWT_SECRET, 'webquanlytour-payments-v1', 'payment-webhook-v1', 32
    )) : null);
    return { mode, enabled: mode === 'mock', webhookSecret, toleranceSeconds: 300 };
}

/** Chặn mọi thao tác thu/hoàn tiền mô phỏng khi chưa được bật hoặc thiếu khóa ký webhook. */
function requireMockPayments() {
    const config = getPaymentConfig();
    if (!config.enabled || !config.webhookSecret) {
        throw Object.assign(new Error('Thanh toán thử nghiệm hiện không khả dụng.'), { status: 503 });
    }
    return config;
}

module.exports = { getPaymentConfig, requireMockPayments };
