const { createHmac, timingSafeEqual, randomUUID } = require('node:crypto');
const pool = require('../config/db');
const Booking = require('../models/BookingModel');
const bookingService = require('./bookingService');
const validate = require('../validators/paymentValidator');
const { getPaymentConfig, requireMockPayments } = require('../config/payment');

const PAYMENT_SELECT = `SELECT p.*,b.customer_id,b.booking_code,b.status AS booking_status,
    b.hold_expires_at,b.total_price AS booking_total,b.currency AS booking_currency
    FROM payments p JOIN bookings b ON b.id=p.booking_id`;
const DUPLICATE_REASON = '[DUPLICATE_PAYMENT]';

/** Lỗi HTTP nghiệp vụ, không chứa thông tin thẻ, chữ ký hay bí mật webhook. */
function error(status, message) { return Object.assign(new Error(message), { status }); }

/** Trả lỗi sau khi transaction hết hạn giữ chỗ đã commit, không rollback việc trả chỗ. */
function unwrap(result) {
    if (result?.deferredError) throw result.deferredError;
    return result;
}

/** Kiểm tra chủ sở hữu trước khi làm bất kỳ thay đổi nào với booking/payment. */
function assertOwner(ctx, customerId) {
    if (String(ctx.booking.customer_id) !== String(customerId)) throw error(404, 'Không tìm thấy thanh toán.');
}

/** Tra quan hệ payment -> booking trước transaction, không lấy khóa theo thứ tự ngược. */
async function locate(reference, customerId = null) {
    validate.reference(reference);
    const ownership = customerId == null ? '' : ' AND b.customer_id=?';
    const [rows] = await pool.query(`${PAYMENT_SELECT} WHERE p.payment_reference=?${ownership} LIMIT 1`, customerId == null ? [reference] : [reference, customerId]);
    if (!rows[0]) throw error(404, 'Không tìm thấy thanh toán.');
    return rows[0];
}

/** Chỉ xuất các trường cần cho hóa đơn thử nghiệm; không trả provider_transaction_id. */
function publicPayment(payment, refunds = []) {
    const config = getPaymentConfig();
    return {
        id: payment.id, booking_id: payment.booking_id,
        payment_reference: payment.payment_reference, payment_gateway: payment.payment_gateway,
        amount: payment.amount, currency: payment.currency, status: payment.status,
        paid_at: payment.paid_at || null, created_at: payment.created_at,
        mode: config.mode, checkout_path: `/payments/${payment.payment_reference}`,
        booking: { id: payment.booking_id, booking_code: payment.booking_code,
            status: payment.booking_status, hold_expires_at: payment.hold_expires_at,
            total_price: payment.booking_total, currency: payment.booking_currency },
        refunds
    };
}

/** Đọc chi tiết theo quyền sở hữu hoặc quyền vận hành đã được router kiểm tra. */
async function detail(reference, { customerId = null, operator = false } = {}) {
    if (!operator && customerId == null) throw error(403, 'Không có quyền đọc thanh toán.');
    const payment = await locate(reference, operator ? null : customerId);
    const [refunds] = await pool.query('SELECT id,payment_id,amount,reason,status,created_at,processed_at FROM refunds WHERE payment_id=? ORDER BY id DESC', [payment.id]);
    return publicPayment(payment, refunds);
}

/**
 * Tìm khoản tiền khác vẫn đủ bao phủ toàn bộ booking sau các lần hoàn đã thành công.
 * Khóa payment rồi refund trong cùng booking để hai yêu cầu không thể hoàn nốt khoản bảo đảm cuối.
 */
async function otherCoveringPayments(ctx, excludedPaymentId) {
    const [payments] = await ctx.connection.query("SELECT id,amount,currency FROM payments WHERE booking_id=? AND status='success' AND id<>? ORDER BY id FOR UPDATE", [ctx.booking.id, excludedPaymentId]);
    const required = validate.cents(ctx.booking.total_price);
    const covering = [];
    for (const payment of payments) {
        if (payment.currency !== ctx.booking.currency) continue;
        const [refunds] = await ctx.connection.query("SELECT amount FROM refunds WHERE payment_id=? AND status='success' ORDER BY id FOR UPDATE", [payment.id]);
        const returned = refunds.reduce((sum, refund) => sum + validate.cents(refund.amount), 0n);
        if (required > 0n && validate.cents(payment.amount) - returned >= required) covering.push(payment);
    }
    return covering;
}

/**
 * Mỗi booking chỉ có một lần thanh toán đang xử lý/thành công. Giá lấy từ snapshot booking,
 * việc gọi lặp hoặc hai tab đồng thời được serialize bằng khóa booking chung.
 */
async function create(bookingId, customerId) {
    requireMockPayments();
    const result = await Booking.withLockedBooking(bookingId, async (ctx) => {
        assertOwner(ctx, customerId);
        await bookingService.expireLocked(ctx);
        const [existing] = await ctx.connection.query("SELECT * FROM payments WHERE booking_id=? AND status IN ('processing','success') ORDER BY (status='success') DESC,id DESC FOR UPDATE", [ctx.booking.id]);
        if (ctx.booking.status === 'confirmed' && existing[0]?.status === 'success') return existing[0].payment_reference;
        if (ctx.booking.status !== 'pending') return { deferredError: error(409, 'Booking không còn ở trạng thái chờ thanh toán.') };
        if (validate.cents(ctx.booking.total_price) === 0n) return { deferredError: error(409, 'Booking này không cần thanh toán.') };
        if (ctx.booking.currency !== 'VND') throw error(409, 'Đơn vị tiền của booking chưa được hỗ trợ.');
        if (existing[0]) return existing[0].payment_reference;
        const reference = `PAY-${randomUUID()}`;
        await ctx.connection.query("INSERT INTO payments (booking_id,payment_reference,payment_gateway,amount,currency,status) VALUES (?,?,'mock',?,?,'processing')", [ctx.booking.id, reference, ctx.booking.total_price, ctx.booking.currency]);
        return reference;
    });
    return detail(unwrap(result), { customerId });
}

/** Ký chính xác timestamp.rawBody; chỉ server giữ khóa và tạo chữ ký cho mô phỏng. */
function signWebhook(rawBody, timestamp = Math.floor(Date.now() / 1000)) {
    const config = requireMockPayments();
    if (!Buffer.isBuffer(rawBody)) throw error(400, 'Webhook cần body nguyên bản.');
    const signature = createHmac('sha256', config.webhookSecret).update(`${timestamp}.`).update(rawBody).digest('hex');
    return `t=${timestamp},v1=${signature}`;
}

/** Chống giả mạo/replay quá hạn; so sánh chữ ký cùng độ dài bằng timingSafeEqual. */
function verifyWebhook(rawBody, signature, nowSeconds = Math.floor(Date.now() / 1000)) {
    const config = requireMockPayments();
    if (!Buffer.isBuffer(rawBody) || rawBody.length > 65536) throw error(400, 'Webhook cần body JSON nguyên bản, tối đa 64 KiB.');
    const match = typeof signature === 'string' && /^t=(\d{10}),\s*v1=([a-f0-9]{64})$/i.exec(signature);
    if (!match || Math.abs(nowSeconds - Number(match[1])) > config.toleranceSeconds) throw error(401, 'Chữ ký webhook không hợp lệ hoặc đã quá hạn.');
    const expected = createHmac('sha256', config.webhookSecret).update(`${match[1]}.`).update(rawBody).digest();
    if (!timingSafeEqual(expected, Buffer.from(match[2], 'hex'))) throw error(401, 'Chữ ký webhook không hợp lệ hoặc đã quá hạn.');
    let payload;
    try { payload = JSON.parse(rawBody.toString('utf8')); } catch { throw error(400, 'JSON webhook không hợp lệ.'); }
    return validate.webhook(payload);
}

/**
 * Ghi nhận webhook trong cùng transaction với xác nhận đơn/yêu cầu hoàn tiền.
 * Khóa tour -> lịch -> booking -> payment; thành công không bị sự kiện thất bại đến sau hạ cấp.
 */
async function processWebhook(rawBody, signature) {
    const payload = verifyWebhook(rawBody, signature);
    const located = await locate(payload.payment_reference);
    return Booking.withLockedBooking(located.booking_id, async (ctx) => {
        const [rows] = await ctx.connection.query('SELECT * FROM payments WHERE payment_reference=? AND booking_id=? FOR UPDATE', [payload.payment_reference, ctx.booking.id]);
        const payment = rows[0];
        if (!payment) throw error(404, 'Không tìm thấy thanh toán.');
        if (payload.gateway !== payment.payment_gateway || payload.currency !== payment.currency || payment.currency !== ctx.booking.currency ||
            validate.cents(payload.amount) !== validate.cents(payment.amount) || validate.cents(payment.amount) !== validate.cents(ctx.booking.total_price)) {
            throw error(409, 'Số tiền hoặc đơn vị thanh toán không khớp với booking.');
        }
        if (payment.provider_transaction_id && payment.provider_transaction_id !== payload.provider_transaction_id) throw error(409, 'Mã giao dịch nhà cung cấp không khớp.');
        const [duplicates] = await ctx.connection.query('SELECT id FROM payments WHERE payment_gateway=? AND provider_transaction_id=? AND id<>? FOR UPDATE', [payload.gateway, payload.provider_transaction_id, payment.id]);
        if (duplicates.length) throw error(409, 'Mã giao dịch nhà cung cấp đã được sử dụng.');
        if (payment.status === 'success' || (payment.status === 'failed' && payload.status === 'failed')) return { accepted: true, replayed: true, payment_reference: payment.payment_reference };
        await bookingService.expireLocked(ctx);
        await ctx.connection.query('UPDATE payments SET status=?,provider_transaction_id=?,paid_at=CASE WHEN ?=\'success\' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?', [payload.status, payload.provider_transaction_id, payload.status, payment.id]);
        payment.status = payload.status;
        payment.provider_transaction_id = payload.provider_transaction_id;
        if (payload.status === 'success') {
            const otherPaid = await otherCoveringPayments(ctx, payment.id);
            if (ctx.booking.status === 'pending' && !otherPaid.length) {
                await bookingService.confirmLocked(ctx, { actorId: null, note: 'Webhook thanh toán thử nghiệm đã được xác minh.' });
            } else if (['confirmed', 'completed'].includes(ctx.booking.status) && !otherPaid.length) {
                // Dữ liệu cũ có thể đã xác nhận thủ công trước khi thanh toán; khoản đầu tiên vẫn hợp lệ.
                // Giữ nguyên trạng thái, không tạo hoàn tiền cho khoản đang bảo đảm booking này.
            } else {
                const reason = otherPaid.length ? `${DUPLICATE_REASON} Thanh toán bổ sung cho booking đã được thanh toán.` : 'Thanh toán đến sau khi booking không còn giữ chỗ; cần hoàn tiền.';
                await Booking.requestRefundLocked(ctx, payment, reason);
            }
        }
        return { accepted: true, replayed: false, payment_reference: payment.payment_reference };
    });
}

/** Khách chỉ chọn kết quả thử nghiệm; server tự lấy tiền/mã đơn và gọi cùng pipeline webhook. */
async function simulate(reference, customerId, outcome) {
    requireMockPayments();
    const payment = await locate(reference, customerId);
    if (payment.payment_gateway !== 'mock') throw error(409, 'Giao dịch không thuộc cổng thử nghiệm.');
    const raw = Buffer.from(JSON.stringify({
        payment_reference: payment.payment_reference,
        // Mã ổn định cho một lần thanh toán giúp hai tab bấm mô phỏng đồng thời vẫn idempotent.
        provider_transaction_id: payment.provider_transaction_id || `mock-${payment.payment_reference}`,
        gateway: 'mock', amount: String(payment.amount), currency: payment.currency, status: outcome
    }));
    await processWebhook(raw, signWebhook(raw));
    return detail(reference, { customerId });
}

/** Danh sách giao dịch cho Admin/Staff có payments.read, không trả thông tin thẻ/giấy tờ. */
async function list(filters) {
    const clauses = [], params = [];
    if (filters.status) { clauses.push('p.status=?'); params.push(filters.status); }
    if (filters.q) { clauses.push('(p.payment_reference LIKE ? OR b.booking_code LIKE ?)'); params.push(`%${filters.q}%`, `%${filters.q}%`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [count] = await pool.query(`SELECT COUNT(*) AS total FROM payments p JOIN bookings b ON b.id=p.booking_id ${where}`, params);
    const [rows] = await pool.query(`${PAYMENT_SELECT} ${where} ORDER BY p.created_at DESC,p.id DESC LIMIT ? OFFSET ?`, [...params, filters.limit, (filters.page - 1) * filters.limit]);
    const total = Number(count[0].total);
    return { data: rows.map((payment) => publicPayment(payment)), meta: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
}

/**
 * Xác nhận hoàn tiền mock cho yêu cầu đã tồn tại; không tạo chuyển khoản thật.
 * Booking còn hiệu lực chỉ được hoàn khoản trả trùng đã được service đánh dấu và kiểm tra lại.
 */
async function approveRefund(reference, reason) {
    requireMockPayments();
    const located = await locate(reference);
    await Booking.withLockedBooking(located.booking_id, async (ctx) => {
        const [payments] = await ctx.connection.query('SELECT * FROM payments WHERE payment_reference=? AND booking_id=? FOR UPDATE', [reference, ctx.booking.id]);
        const payment = payments[0];
        if (!payment || payment.status !== 'success' || payment.payment_gateway !== 'mock') throw error(409, 'Giao dịch chưa đủ điều kiện hoàn tiền thử nghiệm.');
        const [refunds] = await ctx.connection.query('SELECT * FROM refunds WHERE payment_id=? ORDER BY id FOR UPDATE', [payment.id]);
        const requested = refunds.filter((refund) => refund.status === 'requested');
        const committed = refunds.filter((refund) => ['requested', 'processing', 'success'].includes(refund.status));
        const returned = refunds.filter((refund) => refund.status === 'success').reduce((sum, refund) => sum + validate.cents(refund.amount), 0n);
        const total = committed.reduce((sum, refund) => sum + validate.cents(refund.amount), 0n);
        const paid = validate.cents(payment.amount);
        if (total > paid || committed.some((refund) => validate.cents(refund.amount) <= 0n)) throw error(409, 'Yêu cầu hoàn tiền vượt giới hạn giao dịch.');
        if (refunds.some((refund) => refund.status === 'processing')) throw error(409, 'Cần hoàn tất khoản hoàn đang xử lý trước khi xác nhận tiếp.');
        if (!requested.length) {
            if (returned === paid && paid > 0n) return;
            throw error(409, 'Chưa có yêu cầu hoàn tiền phù hợp để xác nhận.');
        }
        if (!['cancelled', 'expired'].includes(ctx.booking.status)) {
            if (!requested.every((refund) => refund.reason?.startsWith(DUPLICATE_REASON))) throw error(409, 'Cần hủy booking trước khi hoàn tiền.');
            const otherPaid = await otherCoveringPayments(ctx, payment.id);
            if (!otherPaid.length) throw error(409, 'Không tìm thấy khoản thanh toán gốc để xác nhận trả trùng.');
        }
        for (const refund of requested) {
            const note = reason ? Array.from(`${refund.reason || ''} | Xác nhận: ${reason}`).slice(0, 500).join('') : refund.reason;
            await ctx.connection.query("UPDATE refunds SET status='success',provider_refund_id=?,processed_at=CURRENT_TIMESTAMP,reason=? WHERE id=? AND status='requested'", [`mock-refund-${randomUUID()}`, note, refund.id]);
        }
        await require('../models/NotificationModel').enqueue(ctx.connection, ctx.booking.customer_id, {
            type: 'payment.refunded', title: 'Đã xử lý hoàn tiền thử nghiệm', message: 'Yêu cầu hoàn tiền đã được xác nhận trong môi trường mô phỏng. Không có giao dịch chuyển tiền ngân hàng thật.', link: `/bookings/${ctx.booking.id}`
        });
    });
    return detail(reference, { operator: true });
}

module.exports = { create, detail, list, simulate, processWebhook, signWebhook, verifyWebhook, approveRefund };
