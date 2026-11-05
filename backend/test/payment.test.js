const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'payment-tests-customer-secret-with-thirty-two-bytes';
process.env.INTERNAL_JWT_SECRET = 'payment-tests-operations-secret-with-thirty-two-bytes';
process.env.NODE_ENV = 'test';
process.env.PAYMENT_MODE = 'mock';
process.env.PAYMENT_WEBHOOK_SECRET = 'payment-tests-webhook-secret-with-thirty-two-bytes';
const pool = require('../src/config/db');
const Booking = require('../src/models/BookingModel');
const bookingService = require('../src/services/bookingService');
const service = require('../src/services/paymentService');
const validate = require('../src/validators/paymentValidator');
const { getPaymentConfig } = require('../src/config/payment');

/** Repository giả mô phỏng khóa/commit; không kết nối hay ghi MySQL hiện hữu. */
function fixture(t, overrides = {}) {
    const ctx = {
        now: '2027-03-01 07:00:00', tour: { id: '1', status: 'active' },
        schedule: { id: '2', status: 'open', departure_date: '2027-03-02 08:00:00' },
        booking: { id: '3', customer_id: '10', booking_code: 'BK-test', status: 'pending', currency: 'VND', total_price: '100.01', hold_expires_at: '2027-03-01 07:15:00', ...overrides }
    };
    const state = { ctx, payments: [], refunds: [], confirms: 0, releases: 0, commits: 0, refundRequests: 0, inserts: 0 };
    function joined(payment) {
        return { ...payment, customer_id: ctx.booking.customer_id, booking_code: ctx.booking.booking_code, booking_status: ctx.booking.status, hold_expires_at: ctx.booking.hold_expires_at, booking_total: ctx.booking.total_price, booking_currency: ctx.booking.currency };
    }
    t.mock.method(pool, 'query', async (sql, params) => {
        if (sql.includes('FROM payments p JOIN bookings b') && sql.includes('p.payment_reference=?')) {
            const item = state.payments.find((payment) => payment.payment_reference === params[0]);
            return [item && (params.length < 2 || String(params[1]) === ctx.booking.customer_id) ? [joined(item)] : []];
        }
        if (sql.includes('FROM refunds WHERE payment_id=?')) return [state.refunds.filter((refund) => refund.payment_id === params[0]).map((refund) => ({ ...refund }))];
        throw new Error(`Truy vấn pool chưa được giả lập: ${sql}`);
    });
    ctx.connection = {
        async query(sql, params) {
            if (sql.startsWith('SELECT * FROM payments WHERE booking_id=')) return [state.payments.filter((payment) => payment.booking_id === params[0] && ['processing', 'success'].includes(payment.status)).sort((a, b) => Number(b.status === 'success') - Number(a.status === 'success')).map((row) => ({ ...row }))];
            if (sql.startsWith('SELECT * FROM payments WHERE payment_reference=')) return [state.payments.filter((payment) => payment.payment_reference === params[0] && payment.booking_id === params[1]).map((row) => ({ ...row }))];
            if (sql.startsWith('SELECT id FROM payments WHERE payment_gateway=')) return [state.payments.filter((payment) => payment.payment_gateway === params[0] && payment.provider_transaction_id === params[1] && payment.id !== params[2]).map((row) => ({ ...row }))];
            if (/^SELECT id(?:,amount,currency)? FROM payments WHERE booking_id=/.test(sql)) return [state.payments.filter((payment) => payment.booking_id === params[0] && payment.status === 'success' && payment.id !== params[1]).map((row) => ({ ...row }))];
            if (sql.startsWith('INSERT INTO payments')) {
                state.inserts++;
                state.payments.push({ id: String(state.payments.length + 1), booking_id: params[0], payment_reference: params[1], payment_gateway: 'mock', amount: params[2], currency: params[3], status: 'processing', provider_transaction_id: null });
                return [{ insertId: state.payments.length }];
            }
            if (sql.startsWith('UPDATE payments SET')) {
                const payment = state.payments.find((item) => item.id === params[3]);
                Object.assign(payment, { status: params[0], provider_transaction_id: params[1], paid_at: params[0] === 'success' ? ctx.now : null });
                return [{ affectedRows: 1 }];
            }
            if (sql.startsWith('SELECT * FROM refunds')) return [state.refunds.filter((refund) => refund.payment_id === params[0]).map((refund) => ({ ...refund }))];
            if (sql.startsWith('SELECT amount FROM refunds')) return [state.refunds.filter((refund) => refund.payment_id === params[0] && refund.status === 'success').map((refund) => ({ amount: refund.amount }))];
            if (sql.startsWith('UPDATE refunds SET')) {
                const refund = state.refunds.find((item) => item.id === params[2]);
                Object.assign(refund, { status: 'success', provider_refund_id: params[0], reason: params[1], processed_at: ctx.now });
                return [{ affectedRows: 1 }];
            }
            throw new Error(`Truy vấn transaction chưa được giả lập: ${sql}`);
        }
    };
    let queue = Promise.resolve();
    t.mock.method(Booking, 'withLockedBooking', (id, work) => {
        const result = queue.then(async () => {
            if (String(id) !== ctx.booking.id) throw Object.assign(new Error('Không tìm thấy booking.'), { status: 404 });
            const value = await work(ctx); state.commits++; return value;
        });
        queue = result.catch(() => {});
        return result;
    });
    t.mock.method(bookingService, 'expireLocked', async () => {
        if (ctx.booking.status === 'pending' && (ctx.booking.hold_expires_at <= ctx.now || ctx.schedule.departure_date <= ctx.now || ctx.schedule.status === 'cancelled')) {
            ctx.booking.status = 'expired'; state.releases++; return true;
        }
        return false;
    });
    t.mock.method(bookingService, 'confirmLocked', async () => {
        assert.ok(state.payments.some((payment) => payment.status === 'success' && payment.amount === ctx.booking.total_price));
        ctx.booking.status = 'confirmed'; state.confirms++; return ctx.booking;
    });
    t.mock.method(Booking, 'requestRefundLocked', async (context, payment, reason) => {
        state.refundRequests++;
        const existing = state.refunds.find((refund) => refund.payment_id === payment.id);
        if (existing) return existing;
        const refund = { id: String(state.refunds.length + 1), payment_id: payment.id, amount: payment.amount, reason, status: 'requested' };
        state.refunds.push(refund); return refund;
    });
    state.addPayment = (overrides = {}) => {
        const payment = { id: String(state.payments.length + 1), booking_id: ctx.booking.id, payment_reference: `PAY-fixture-${state.payments.length + 1}`, payment_gateway: 'mock', amount: ctx.booking.total_price, currency: 'VND', status: 'processing', provider_transaction_id: null, ...overrides };
        state.payments.push(payment); return payment;
    };
    state.event = (payment, overrides = {}) => Buffer.from(JSON.stringify({ payment_reference: payment.payment_reference, provider_transaction_id: 'mock-provider-1', gateway: 'mock', amount: String(payment.amount), currency: payment.currency, status: 'success', ...overrides }));
    return state;
}

test('webhook xác minh chữ ký, body nguyên bản và timestamp chống giả mạo', () => {
    const body = Buffer.from(JSON.stringify({ payment_reference: 'PAY-a', provider_transaction_id: 'tx-a', gateway: 'mock', amount: '100.01', currency: 'VND', status: 'success' }));
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = service.signWebhook(body, timestamp);
    assert.equal(service.verifyWebhook(body, signature, timestamp).amount, '100.01');
    for (const candidate of [undefined, signature.replace(/.$/, (value) => value === '0' ? '1' : '0'), service.signWebhook(body, timestamp - 301), service.signWebhook(body, timestamp + 301)]) {
        assert.throws(() => service.verifyWebhook(body, candidate, timestamp), { status: 401 });
    }
    assert.throws(() => service.verifyWebhook(Buffer.from(body.toString() + ' '), signature, timestamp), { status: 401 });
    assert.throws(() => service.verifyWebhook({}, signature, timestamp), { status: 400 });
});

test('lần gọi tạo payment lặp/đồng thời dùng cùng giao dịch và giá snapshot của booking', async (t) => {
    const state = fixture(t);
    const [first, second] = await Promise.all([service.create('3', '10'), service.create('3', '10')]);
    assert.equal(state.inserts, 1);
    assert.equal(first.payment_reference, second.payment_reference);
    assert.equal(first.amount, '100.01');
    assert.equal(first.checkout_path, `/payments/${first.payment_reference}`);
    assert.equal(first.mode, 'mock');
});

test('sai chủ sở hữu hoặc booking miễn phí không được tạo giao dịch', async (t) => {
    const state = fixture(t, { total_price: '0.00' });
    await assert.rejects(service.create('3', 'other-customer'), { status: 404 });
    await assert.rejects(service.create('3', '10'), { status: 409 });
    assert.equal(state.inserts, 0);
});

test('gọi thanh toán sau hạn giữ chỗ vẫn commit hết hạn và không tạo payment', async (t) => {
    const state = fixture(t, { hold_expires_at: '2027-03-01 06:59:59' });
    await assert.rejects(service.create('3', '10'), { status: 409 });
    assert.equal(state.ctx.booking.status, 'expired');
    assert.equal(state.releases, 1);
    assert.equal(state.commits, 1);
    assert.equal(state.inserts, 0);
});

test('webhook success xác nhận đúng một lần; replay và failure sau success không hạ cấp', async (t) => {
    const state = fixture(t);
    const payment = state.addPayment();
    const body = state.event(payment);
    assert.equal((await service.processWebhook(body, service.signWebhook(body))).replayed, false);
    assert.equal(state.ctx.booking.status, 'confirmed');
    assert.equal(payment.status, 'success');
    assert.equal((await service.processWebhook(body, service.signWebhook(body))).replayed, true);
    const failed = state.event(payment, { status: 'failed' });
    assert.equal((await service.processWebhook(failed, service.signWebhook(failed))).replayed, true);
    assert.equal(payment.status, 'success');
    assert.equal(state.confirms, 1);
    assert.equal(state.refunds.length, 0);
});

test('sai số tiền/currency hoặc provider ID trùng bị từ chối trước khi ghi nhận thành công', async (t) => {
    const state = fixture(t), payment = state.addPayment();
    const wrongAmount = state.event(payment, { amount: '100.02' });
    await assert.rejects(service.processWebhook(wrongAmount, service.signWebhook(wrongAmount)), { status: 409 });
    const wrongCurrency = state.event(payment, { currency: 'USD' });
    await assert.rejects(service.processWebhook(wrongCurrency, service.signWebhook(wrongCurrency)), { status: 400 });
    state.addPayment({ booking_id: 'other-booking', provider_transaction_id: 'mock-provider-1', status: 'success' });
    const duplicateId = state.event(payment);
    await assert.rejects(service.processWebhook(duplicateId, service.signWebhook(duplicateId)), { status: 409 });
    assert.equal(payment.status, 'processing');
    assert.equal(state.confirms, 0);
});

test('webhook thành công đến muộn trả chỗ và yêu cầu hoàn tiền, không hồi sinh booking', async (t) => {
    const state = fixture(t, { hold_expires_at: '2027-03-01 06:59:59' }), payment = state.addPayment();
    const body = state.event(payment);
    await service.processWebhook(body, service.signWebhook(body));
    assert.equal(payment.status, 'success');
    assert.equal(state.ctx.booking.status, 'expired');
    assert.equal(state.releases, 1);
    assert.equal(state.confirms, 0);
    assert.equal(state.refunds[0].status, 'requested');
    await service.processWebhook(body, service.signWebhook(body));
    assert.equal(state.refunds.length, 1);
    assert.equal(state.releases, 1);
});

test('payment đến sau hủy booking cũng yêu cầu hoàn tiền, không xác nhận lại', async (t) => {
    const state = fixture(t, { status: 'cancelled' }), payment = state.addPayment();
    const body = state.event(payment);
    await service.processWebhook(body, service.signWebhook(body));
    assert.equal(state.ctx.booking.status, 'cancelled');
    assert.equal(payment.status, 'success');
    assert.equal(state.refunds.length, 1);
    assert.equal(state.confirms, 0);
});

test('booking đã xác nhận/hoàn thành thủ công nhận khoản tiền đầu tiên mà không tạo hoàn tiền', async (t) => {
    for (const status of ['confirmed', 'completed']) {
        await t.test(status, async (nested) => {
            const state = fixture(nested, { status }), payment = state.addPayment();
            const body = state.event(payment);
            await service.processWebhook(body, service.signWebhook(body));
            assert.equal(payment.status, 'success');
            assert.equal(state.ctx.booking.status, status);
            assert.equal(state.confirms, 0);
            assert.equal(state.refunds.length, 0);
        });
    }
});

test('khoản cũ đã hoàn toàn bộ không khiến khoản trả hợp lệ mới bị coi là trả trùng', async (t) => {
    const state = fixture(t, { status: 'confirmed' });
    const original = state.addPayment({ status: 'success', provider_transaction_id: 'old-provider' });
    state.refunds.push({ id: '1', payment_id: original.id, amount: original.amount, status: 'success' });
    const payment = state.addPayment(), body = state.event(payment);
    await service.processWebhook(body, service.signWebhook(body));
    assert.equal(payment.status, 'success');
    assert.equal(state.refunds.length, 1);
    assert.equal(state.refundRequests, 0);
});

test('trả tiền lần hai cho booking đã thanh toán tạo yêu cầu hoàn khoản trùng', async (t) => {
    const state = fixture(t, { status: 'confirmed' });
    state.addPayment({ status: 'success', provider_transaction_id: 'original-provider' });
    const extra = state.addPayment();
    const body = state.event(extra);
    await service.processWebhook(body, service.signWebhook(body));
    assert.equal(extra.status, 'success');
    assert.equal(state.ctx.booking.status, 'confirmed');
    assert.match(state.refunds[0].reason, /^\[DUPLICATE_PAYMENT\]/);
    assert.equal(state.confirms, 0);
});

test('failed giữ booking pending để thử lại và retry tạo payment mới sau thất bại', async (t) => {
    const state = fixture(t), payment = state.addPayment();
    const body = state.event(payment, { status: 'failed' });
    await service.processWebhook(body, service.signWebhook(body));
    assert.equal(payment.status, 'failed');
    assert.equal(state.ctx.booking.status, 'pending');
    const retry = await service.create('3', '10');
    assert.notEqual(retry.payment_reference, payment.payment_reference);
    assert.equal(retry.status, 'processing');
});

test('mô phỏng dùng cùng pipeline ký/xác minh và khách khác không đọc/thanh toán được', async (t) => {
    const state = fixture(t), payment = state.addPayment();
    await assert.rejects(service.detail(payment.payment_reference, { customerId: '11' }), { status: 404 });
    await assert.rejects(service.simulate(payment.payment_reference, '11', 'success'), { status: 404 });
    const result = await service.simulate(payment.payment_reference, '10', 'success');
    assert.equal(result.status, 'success');
    assert.equal(result.booking.status, 'confirmed');
    assert.equal(Object.hasOwn(result, 'provider_transaction_id'), false);
});

test('hai tab mô phỏng đồng thời cùng một payment nhận kết quả ổn định, không tạo giao dịch lạ', async (t) => {
    const state = fixture(t), payment = state.addPayment();
    const [first, second] = await Promise.all([
        service.simulate(payment.payment_reference, '10', 'success'),
        service.simulate(payment.payment_reference, '10', 'success')
    ]);
    assert.equal(first.status, 'success');
    assert.equal(second.status, 'success');
    assert.equal(state.confirms, 1);
    assert.equal(state.refunds.length, 0);
});

test('xác nhận hoàn mock cần requested có sẵn, đúng trạng thái booking và không vượt tiền gốc', async (t) => {
    const state = fixture(t, { status: 'cancelled' });
    const payment = state.addPayment({ status: 'success' });
    await assert.rejects(service.approveRefund(payment.payment_reference), { status: 409 });
    state.refunds.push({ id: '1', payment_id: payment.id, amount: '100.02', status: 'requested', reason: 'Khách hủy.' });
    await assert.rejects(service.approveRefund(payment.payment_reference), { status: 409 });
    state.refunds[0].amount = '100.01';
    const result = await service.approveRefund(payment.payment_reference, 'Đã kiểm tra yêu cầu.');
    assert.equal(result.refunds[0].status, 'success');
    assert.match(state.refunds[0].provider_refund_id, /^mock-refund-/);
    const firstId = state.refunds[0].provider_refund_id;
    await service.approveRefund(payment.payment_reference);
    assert.equal(state.refunds[0].provider_refund_id, firstId);
});

test('không hoàn tiền cho booking confirmed thông thường; khoản trùng cần kiểm tra giao dịch gốc', async (t) => {
    const state = fixture(t, { status: 'confirmed' }), payment = state.addPayment({ status: 'success' });
    state.refunds.push({ id: '1', payment_id: payment.id, amount: payment.amount, status: 'requested', reason: 'Yêu cầu thủ công.' });
    await assert.rejects(service.approveRefund(payment.payment_reference), { status: 409 });
    state.refunds[0].reason = '[DUPLICATE_PAYMENT] Khoản trả trùng.';
    await assert.rejects(service.approveRefund(payment.payment_reference), { status: 409 });
    state.addPayment({ status: 'success', provider_transaction_id: 'original-provider' });
    assert.equal((await service.approveRefund(payment.payment_reference)).refunds[0].status, 'success');
});

test('không hoàn khoản bảo đảm cuối khi khoản success khác đã hoàn toàn bộ hoặc một phần', async (t) => {
    const state = fixture(t, { status: 'confirmed' });
    const original = state.addPayment({ status: 'success', provider_transaction_id: 'original-provider' });
    const duplicate = state.addPayment({ status: 'success', provider_transaction_id: 'second-provider' });
    const prior = { id: '1', payment_id: original.id, amount: original.amount, status: 'success' };
    state.refunds.push(prior, { id: '2', payment_id: duplicate.id, amount: duplicate.amount, status: 'requested', reason: '[DUPLICATE_PAYMENT] Khoản trả trùng.' });
    await assert.rejects(service.approveRefund(duplicate.payment_reference), { status: 409 });
    prior.amount = '1.00';
    await assert.rejects(service.approveRefund(duplicate.payment_reference), { status: 409 });
    assert.equal(state.refunds[1].status, 'requested');
});

test('hai khoản hoàn duplicate đã yêu cầu không thể cùng lấy hết tiền bảo đảm booking', async (t) => {
    const state = fixture(t, { status: 'confirmed' });
    const first = state.addPayment({ status: 'success', provider_transaction_id: 'first-provider' });
    const second = state.addPayment({ status: 'success', provider_transaction_id: 'second-provider' });
    state.refunds.push(
        { id: '1', payment_id: first.id, amount: first.amount, status: 'requested', reason: '[DUPLICATE_PAYMENT] Request 1.' },
        { id: '2', payment_id: second.id, amount: second.amount, status: 'requested', reason: '[DUPLICATE_PAYMENT] Request 2.' }
    );
    await service.approveRefund(first.payment_reference);
    await assert.rejects(service.approveRefund(second.payment_reference), { status: 409 });
    assert.deepEqual(state.refunds.map((refund) => refund.status), ['success', 'requested']);
});

test('hoàn mock hỗ trợ lịch sử hoàn một phần và bỏ qua khoản failed, không tạo yêu cầu mới', async (t) => {
    const state = fixture(t, { status: 'cancelled', total_price: '100.00' });
    const payment = state.addPayment({ status: 'success' });
    state.refunds.push(
        { id: '1', payment_id: payment.id, amount: '40.00', status: 'success', reason: 'Đã hoàn một phần.' },
        { id: '2', payment_id: payment.id, amount: '100.00', status: 'failed', reason: 'Lần lỗi không chuyển tiền.' },
        { id: '3', payment_id: payment.id, amount: '60.00', status: 'requested', reason: 'Phần còn lại.' }
    );
    await service.approveRefund(payment.payment_reference);
    assert.deepEqual(state.refunds.map((refund) => refund.status), ['success', 'failed', 'success']);
    assert.equal(state.refunds.length, 3);
    assert.equal(state.refundRequests, 0);
    const completedId = state.refunds[2].provider_refund_id;
    await service.approveRefund(payment.payment_reference);
    assert.equal(state.refunds[2].provider_refund_id, completedId);
});

test('production luôn tắt mock dù cấu hình yêu cầu bật, không tạo hoặc hoàn tiền giả', async (t) => {
    const previousMode = process.env.NODE_ENV, previousPayment = process.env.PAYMENT_MODE;
    process.env.NODE_ENV = 'production'; process.env.PAYMENT_MODE = 'mock';
    t.after(() => { if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode; if (previousPayment === undefined) delete process.env.PAYMENT_MODE; else process.env.PAYMENT_MODE = previousPayment; });
    assert.equal(getPaymentConfig().mode, 'disabled');
    await assert.rejects(service.create('3', '10'), { status: 503 });
    await assert.rejects(service.approveRefund('PAY-test'), { status: 503 });
    assert.throws(() => service.signWebhook(Buffer.from('{}')), { status: 503 });
});

test('validator chặn giá/trạng thái booking từ client và tính tiền bằng BigInt chính xác', () => {
    assert.equal(validate.cents('9999999999.99'), 999999999999n);
    assert.throws(() => validate.simulation({ outcome: 'success', amount: '1' }), { status: 400 });
    assert.throws(() => validate.refund({ amount: 1 }), { status: 400 });
    assert.throws(() => validate.listQuery({ page: ['1'] }), { status: 400 });
    for (const invalid of ['1e3', '-1', '0.001', '10000000000']) assert.throws(() => validate.cents(invalid), { status: 400 });
});

test('HTTP giữ scope/ownership, raw webhook và Staff permissions ở đúng lớp router', async (t) => {
    const state = fixture(t), payment = state.addPayment();
    const User = require('../src/models/UserModel');
    const { getPortalConfig } = require('../src/config/authPortal');
    let permissions = [];
    t.mock.method(User, 'findById', async (id) => ({ id, status: 'active', role: id === '20' ? 'staff' : 'customer' }));
    t.mock.method(User, 'permissionsFor', async () => permissions);
    const routes = require('../src/routes/paymentRoutes');
    const app = express();
    app.use('/api/payments/webhook', express.raw({ type: 'application/json', limit: '64kb' }), routes.webhookRouter);
    app.use(express.json());
    app.use('/api/payments', routes.customerRouter);
    app.use('/api/manage/payments', routes.manageRouter);
    app.use((error, req, res, next) => res.status(error.status || 500).json({ message: error.message }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    t.after(() => new Promise((resolve) => server.close(resolve)));
    function auth(id, portal) {
        const config = getPortalConfig(portal);
        return { Authorization: `Bearer ${jwt.sign({ portal }, config.secret, { subject: id, issuer: config.issuer, audience: config.audience, expiresIn: '1h' })}` };
    }
    assert.equal((await fetch(`${base}/payments/${payment.payment_reference}`)).status, 401);
    assert.equal((await fetch(`${base}/payments/${payment.payment_reference}`, { headers: auth('20', 'operations') })).status, 401);
    assert.equal((await fetch(`${base}/payments/${payment.payment_reference}`, { headers: auth('11', 'customer') })).status, 404);
    assert.equal((await fetch(`${base}/manage/payments/${payment.payment_reference}`, { headers: auth('20', 'operations') })).status, 403);
    permissions = ['payments.read'];
    assert.equal((await fetch(`${base}/manage/payments/${payment.payment_reference}`, { headers: auth('20', 'operations') })).status, 200);
    const badForm = await fetch(`${base}/payments/${payment.payment_reference}/simulate`, { method: 'POST', headers: { ...auth('10', 'customer'), 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome: 'success', amount: '1' }) });
    assert.equal(badForm.status, 400);
    const raw = state.event(payment);
    const webhook = await fetch(`${base}/payments/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Payment-Signature': service.signWebhook(raw) }, body: raw });
    assert.equal(webhook.status, 200);
    assert.equal(state.ctx.booking.status, 'confirmed');
});
