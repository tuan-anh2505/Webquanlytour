const base = require('./authValidator');

/** Chuẩn hóa mã giao dịch để không cho URL/query tùy ý đi vào truy vấn. */
function reference(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) {
        throw base.validationError('Mã thanh toán không hợp lệ.');
    }
    return value;
}

/** So sánh DECIMAL(12,2) bằng đơn vị nhỏ nhất, không dùng số thực khi xác minh tiền. */
function cents(value) {
    const text = String(value ?? '');
    if (!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(text)) {
        throw base.validationError('Số tiền thanh toán không hợp lệ.');
    }
    const [whole, decimal = ''] = text.split('.');
    return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'));
}

/** Webhook chỉ nhận thông tin do mock gateway ký; không nhận dữ liệu thẻ hoặc giá client. */
function webhook(body) {
    base.objectBody(body);
    base.allowFields(body, ['payment_reference', 'provider_transaction_id', 'gateway', 'amount', 'currency', 'status']);
    reference(body.payment_reference);
    if (typeof body.provider_transaction_id !== 'string' || !/^[A-Za-z0-9_-]{1,150}$/.test(body.provider_transaction_id)) {
        throw base.validationError('Mã giao dịch nhà cung cấp không hợp lệ.');
    }
    if (typeof body.amount !== 'string') throw base.validationError('Số tiền webhook phải là chuỗi thập phân.');
    cents(body.amount);
    if (body.gateway !== 'mock' || body.currency !== 'VND' || !['success', 'failed'].includes(body.status)) {
        throw base.validationError('Dữ liệu cổng thanh toán không hợp lệ.');
    }
    return body;
}

/** Biểu mẫu mô phỏng chỉ được chọn kết quả, không được gửi số tiền hoặc trạng thái booking. */
function simulation(body) {
    base.objectBody(body);
    base.allowFields(body, ['outcome']);
    if (!['success', 'failed'].includes(body.outcome)) throw base.validationError('Kết quả thử nghiệm không hợp lệ.');
    return body.outcome;
}

/** Xác nhận hoàn tiền thử nghiệm chỉ nhận ghi chú tùy chọn, không cho sửa số tiền. */
function refund(body) {
    base.objectBody(body);
    base.allowFields(body, ['reason']);
    return body.reason == null ? null : base.text(body.reason, 'reason', { max: 500, required: false });
}

/** Kiểm tra phân trang và bộ lọc danh sách giao dịch của người vận hành. */
function listQuery(query) {
    const page = Number(query.page ?? 1), limit = Number(query.limit ?? 20);
    if (Array.isArray(query.page) || Array.isArray(query.limit) || !Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw base.validationError('Phân trang thanh toán không hợp lệ.');
    }
    const status = query.status || '';
    if (status && !['processing', 'success', 'failed'].includes(status)) throw base.validationError('Trạng thái thanh toán không hợp lệ.');
    const q = query.q === undefined ? '' : base.text(query.q, 'q', { max: 150, required: false }) || '';
    return { page, limit, status, q };
}

module.exports = { reference, cents, webhook, simulation, refund, listQuery };
