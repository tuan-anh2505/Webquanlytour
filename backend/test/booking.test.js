const { test } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/db');
const Booking = require('../src/models/BookingModel');
const service = require('../src/services/bookingService');

// Cấm mọi kết nối ngoài ý muốn trong file này. Adapter dưới đây chỉ thay DB trong test.
pool.query = async () => { throw new Error('Không được truy cập DB thật trong booking test.'); };
pool.getConnection = async () => { throw new Error('Không được mở DB thật trong booking test.'); };
const NOW = '2030-01-01 08:00:00';
const KEY1 = '123e4567-e89b-42d3-a456-426614174000';
const KEY2 = '123e4567-e89b-42d3-a456-426614174001';

/** Fixture hành khách không chứa trường giá, chỗ hoặc chủ sở hữu từ client. */
function request() {
  return { schedule_id: '10', contact_name: 'An', contact_email: 'an@example.com', contact_phone: '0901234567',
    passengers: [{ full_name: 'An', passenger_type: 'adult' }] };
}

/** Adapter có mutex và snapshot rollback để thử hai request đồng thời với cùng số chỗ. */
function store(t, { capacity = 2, booked = 0, price = '100.00', bookings = [], payments = [], failPassenger = false } = {}) {
  // Email/outbox được kiểm tra riêng trong notification.test; suite này tập trung transaction giá/chỗ.
  t.mock.method(require('../src/models/NotificationModel'), 'bookingEvent', async () => {});
  t.mock.method(require('../src/models/NotificationModel'), 'enqueue', async () => {});
  const state = {
    tour: { id: '3', status: 'active', base_price: price, child_price: '50.00', infant_price: '0.00' },
    schedule: { id: '10', tour_id: '3', status: 'open', max_capacity: capacity, booked_seats: booked, departure_date: '2030-02-01 08:00:00' },
    bookings: structuredClone(bookings), passengers: [], history: [], refunds: [], payments: structuredClone(payments), commits: 0, rollbacks: 0
  };
  const writes = [];
  const connection = {
    async query(sql, params = []) {
      if (sql.startsWith('SELECT * FROM bookings WHERE schedule_id=')) return [structuredClone(state.bookings.filter(row => row.status === 'pending' && row.hold_expires_at <= NOW))];
      if (sql.startsWith('SELECT full_name,passenger_type')) return [state.passengers.filter(row => String(row.booking_id) === String(params[0]))];
      if (sql.startsWith('SELECT id,amount,currency FROM payments')) return [state.payments.filter(row => row.status === 'success')];
      if (sql.startsWith('SELECT * FROM payments')) return [state.payments.filter(row => row.status === 'success')];
      if (sql.startsWith('SELECT id,booking_id,amount,status FROM payments')) return [state.payments.filter(row => String(row.id) === String(params[0]))];
      if (sql.startsWith('SELECT * FROM refunds')) return [state.refunds.filter(row => String(row.payment_id) === String(params[0]))];
      writes.push({ sql, params });
      if (sql.startsWith('UPDATE tour_schedules SET booked_seats=booked_seats+')) {
        if (state.schedule.booked_seats + params[0] > state.schedule.max_capacity) return [{ affectedRows: 0 }];
        state.schedule.booked_seats += params[0]; return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE tour_schedules SET booked_seats=booked_seats-')) {
        if (state.schedule.booked_seats < params[0]) return [{ affectedRows: 0 }];
        state.schedule.booked_seats -= params[0]; return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO bookings')) {
        const id = String(state.bookings.length + 20);
        state.bookings.push({ id, booking_code: params[0], customer_id: params[1], schedule_id: params[2], contact_name: params[3], contact_email: params[4], contact_phone: params[5], seat_count: params[6], subtotal: params[7], total_price: params[8], currency: 'VND', status: params[9], hold_expires_at: params[10], confirmed_at: params[11], customer_note: params[12] });
        return [{ insertId: id }];
      }
      if (sql.startsWith('INSERT INTO booking_passengers')) {
        if (failPassenger) throw Object.assign(new Error('Simulated write failure'), { code: 'TEST_WRITE_FAILURE' });
        const [booking_id, full_name, passenger_type, date_of_birth, gender, document_type, document_number, occupies_seat, unit_price] = params;
        state.passengers.push({ booking_id, full_name, passenger_type, date_of_birth, gender, document_type, document_number, occupies_seat, unit_price });
        return [{ insertId: state.passengers.length }];
      }
      if (sql.startsWith('INSERT INTO booking_status_history')) { state.history.push(params); return [{ insertId: state.history.length }]; }
      if (sql.startsWith('INSERT INTO refunds')) { const row = { id: String(state.refunds.length + 1), payment_id: params[0], amount: params[1], reason: params[2], status: 'requested' }; state.refunds.push(row); return [{ insertId: row.id }]; }
      if (sql.startsWith('UPDATE bookings SET status=')) {
        const bookingId = sql.includes("status='expired'") ? params[0] : sql.includes("status='confirmed'") ? params[1] : params[2];
        const row = state.bookings.find(item => String(item.id) === String(bookingId));
        if (!row) return [{ affectedRows: 0 }];
        if (sql.includes("status='expired'")) Object.assign(row, { status: 'expired', hold_expires_at: null });
        else if (sql.includes("status='confirmed'")) Object.assign(row, { status: 'confirmed', hold_expires_at: null, confirmed_at: params[0] });
        else Object.assign(row, { status: 'cancelled', hold_expires_at: null, cancelled_at: params[0], cancellation_reason: params[1] });
        return [{ affectedRows: 1 }];
      }
      throw new Error('Unexpected fake query: ' + sql);
    }
  };
  let tail = Promise.resolve();
  async function locked(work, bookingId = null) {
    const prior = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await prior;
    const snapshot = structuredClone(state);
    try {
      const booking = bookingId ? state.bookings.find(row => String(row.id) === String(bookingId)) : null;
      if (bookingId && !booking) throw Booking.error(404, 'Không tìm thấy booking.');
      const result = await work({ connection, tour: structuredClone(state.tour), schedule: structuredClone(state.schedule), booking: booking ? structuredClone(booking) : null, now: NOW });
      state.commits++;
      return result;
    } catch (cause) { Object.assign(state, snapshot); state.rollbacks++; throw cause; }
    finally { release(); }
  }
  t.mock.method(Booking, 'byCode', async code => state.bookings.find(row => row.booking_code === code));
  t.mock.method(Booking, 'withLockedSchedule', async (id, work) => locked(work));
  t.mock.method(Booking, 'withLockedBooking', async (id, work) => locked(work, id));
  t.mock.method(Booking, 'detail', async (id, options) => {
    const row = state.bookings.find(item => String(item.id) === String(id));
    if (!row || (!options.operator && String(row.customer_id) !== String(options.customerId))) throw Booking.error(404, 'Không tìm thấy booking.');
    return { ...row, passengers: state.passengers.filter(item => String(item.booking_id) === String(id)), payments: state.payments, refunds: state.refunds };
  });
  return { state, writes, connection };
}

/** Bản ghi pending chuẩn dùng thử hủy, hết hạn và xác nhận. */
function pending(overrides = {}) {
  return { id: '20', customer_id: '7', schedule_id: '10', status: 'pending', seat_count: 1, total_price: '100.00', currency: 'VND', hold_expires_at: '2030-01-01 08:15:00', ...overrides };
}

test('tạo booking giữ chỗ, snapshot giá và UUID retry không giữ chỗ hai lần', async t => {
  const { state } = store(t);
  const first = await service.createBooking('7', request(), KEY1);
  assert.equal(first.replay, false);
  assert.equal(first.booking.status, 'pending');
  assert.equal(first.booking.total_price, '100.00');
  assert.equal(first.booking.hold_expires_at, '2030-01-01 08:15:00');
  assert.equal(state.schedule.booked_seats, 1);
  const second = await service.createBooking('7', request(), KEY1);
  assert.equal(second.replay, true);
  assert.equal(second.booking.id, first.booking.id);
  assert.equal(state.schedule.booked_seats, 1);
  assert.equal(state.bookings.length, 1);
  await assert.rejects(service.createBooking('7', { ...request(), contact_name: 'Khác' }, KEY1), { status: 409 });
  await assert.rejects(service.createBooking('8', request(), KEY1), { status: 404 });
});

test('hai booking đồng thời không thể giữ quá chỗ còn lại', async t => {
  const { state } = store(t, { capacity: 1 });
  const result = await Promise.allSettled([service.createBooking('7', request(), KEY1), service.createBooking('8', request(), KEY2)]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(result.find(item => item.status === 'rejected').reason.status, 409);
  assert.equal(state.schedule.booked_seats, 1);
  assert.equal(state.bookings.length, 1);
});

test('hai retry cùng UUID đồng thời chỉ tạo một booking', async t => {
  const { state } = store(t, { capacity: 1 });
  const result = await Promise.all([service.createBooking('7', request(), KEY1), service.createBooking('7', request(), KEY1)]);
  assert.deepEqual(result.map(item => item.replay).sort(), [false, true]);
  assert.equal(state.bookings.length, 1);
  assert.equal(state.schedule.booked_seats, 1);
});

test('lỗi ghi hành khách rollback booking và chỗ đã giữ', async t => {
  const { state } = store(t, { failPassenger: true });
  await assert.rejects(service.createBooking('7', request(), KEY1), { code: 'TEST_WRITE_FAILURE' });
  assert.equal(state.bookings.length, 0);
  assert.equal(state.schedule.booked_seats, 0);
  assert.equal(state.rollbacks, 1);
});

test('tour không thu phí xác nhận ngay, không tạo payment hay hold', async t => {
  const { state } = store(t, { price: '0.00' });
  const { booking } = await service.createBooking('7', request(), KEY1);
  assert.equal(booking.status, 'confirmed');
  assert.equal(booking.total_price, '0.00');
  assert.equal(booking.hold_expires_at, null);
  assert.equal(state.payments.length, 0);
});

test('thu hồi hold cũ vẫn commit khi yêu cầu mới không đủ chỗ', async t => {
  const old = pending({ id: '19', hold_expires_at: '2029-12-31 08:00:00' });
  const { state } = store(t, { capacity: 1, booked: 1, bookings: [old] });
  const body = request(); body.passengers.push({ full_name: 'Người thứ hai', passenger_type: 'adult' });
  await assert.rejects(service.createBooking('7', body, KEY1), { status: 409 });
  assert.equal(state.schedule.booked_seats, 0);
  assert.equal(state.bookings[0].status, 'expired');
  assert.equal(state.commits, 1);
  assert.equal(state.rollbacks, 0);
});

test('hủy chính chủ trả chỗ một lần và yêu cầu hoàn tiền chỉ một lần', async t => {
  const row = pending({ status: 'confirmed', hold_expires_at: null });
  const payment = { id: '30', booking_id: '20', status: 'success', amount: '100.00', currency: 'VND' };
  const { state } = store(t, { booked: 1, bookings: [row], payments: [payment] });
  await assert.rejects(service.cancelBooking('20', { customerId: '8', reason: 'Hủy' }), { status: 404 });
  assert.equal(state.schedule.booked_seats, 1);
  await service.cancelBooking('20', { customerId: '7', reason: 'Thay đổi kế hoạch' });
  await service.cancelBooking('20', { customerId: '7', reason: 'Thử lại' });
  assert.equal(state.schedule.booked_seats, 0);
  assert.equal(state.refunds.length, 1);
  assert.equal(state.refunds[0].status, 'requested');
  assert.equal(state.history.filter(row => row[3] === 'cancelled').length, 1);
});

test('hết hạn commit trước khi từ chối xác nhận, không trả chỗ hai lần', async t => {
  const { state } = store(t, { booked: 1, bookings: [pending({ hold_expires_at: NOW })] });
  await assert.rejects(service.confirmBooking('20', { actorId: '1' }), { status: 409 });
  assert.equal(state.bookings[0].status, 'expired');
  assert.equal(state.schedule.booked_seats, 0);
  assert.equal(state.commits, 1);
  await service.getBooking('20', { customerId: '7' });
  assert.equal(state.schedule.booked_seats, 0);
});

test('hoàn tiền chỉ yêu cầu phần còn lại và không tính refund failed là tiền đã hoàn', async t => {
  const payment = { id: '30', booking_id: '20', status: 'success', amount: '100.00', currency: 'VND' };
  const { state } = store(t, { booked: 1, bookings: [pending({ status: 'confirmed', hold_expires_at: null })], payments: [payment] });
  state.refunds.push({ id: '1', payment_id: '30', status: 'success', amount: '40.00' }, { id: '2', payment_id: '30', status: 'failed', amount: '100.00' });
  await service.cancelBooking('20', { customerId: '7', reason: 'Hủy' });
  assert.equal(state.refunds.length, 3);
  assert.equal(state.refunds[2].status, 'requested');
  assert.equal(state.refunds[2].amount, '60.00');
});

test('không xác nhận khoản trả thiếu/sai tiền tệ; khoản đúng và booking miễn phí được xác nhận', async t => {
  const { state } = store(t, { booked: 1, bookings: [pending()], payments: [{ id: '30', booking_id: '20', status: 'success', amount: '99.99', currency: 'VND' }] });
  await assert.rejects(service.confirmBooking('20', { actorId: '1' }), { status: 409 });
  state.payments[0].amount = '100.00'; state.payments[0].currency = 'USD';
  await assert.rejects(service.confirmBooking('20', { actorId: '1' }), { status: 409 });
  state.payments[0].currency = 'VND';
  await service.confirmBooking('20', { actorId: '1' });
  assert.equal(state.bookings[0].status, 'confirmed');
  assert.equal(state.schedule.booked_seats, 1);
  await service.confirmBooking('20', { actorId: '1' });
  assert.equal(state.history.filter(row => row[3] === 'confirmed').length, 1);
});

test('một booking có counter sai không ngăn job thu hồi các booking còn lại', async t => {
  t.mock.method(pool, 'query', async () => [[{ id: '1' }, { id: '2' }, { id: '3' }]]);
  t.mock.method(Booking, 'withLockedBooking', async id => { if (id === '2') throw Booking.error(409, 'Counter không nhất quán.'); return true; });
  const result = await service.expireDueBookings();
  assert.deepEqual(result, { expired: 2, checked: 3, failed: 1, failureCodes: ['HTTP_409'] });
});

test('model giữ đúng thứ tự khóa tour -> schedule -> booking và rollback/release khi callback lỗi', async t => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async query(sql) {
      events.push(sql);
      if (sql.includes('FROM tours')) return [[{ id: '3' }]];
      if (sql.includes('FROM tour_schedules')) return [[{ id: '10', tour_id: '3' }]];
      if (sql.includes('DATE_FORMAT')) return [[{ now: NOW }]];
      if (sql.includes('FROM bookings')) return [[pending()]];
      throw new Error('Unexpected query');
    },
    async commit() { events.push('commit'); }, async rollback() { events.push('rollback'); }, release() { events.push('release'); }
  };
  t.mock.method(pool, 'query', async () => [[{ id: '20', schedule_id: '10', tour_id: '3' }]]);
  t.mock.method(pool, 'getConnection', async () => connection);
  await assert.rejects(Booking.withLockedBooking('20', async ctx => { assert.equal(ctx.now, NOW); throw Booking.error(409, 'Conflict'); }), { status: 409 });
  const locks = events.filter(event => event.includes('FOR UPDATE'));
  assert.match(locks[0], /FROM tours/); assert.match(locks[1], /FROM tour_schedules/); assert.match(locks[2], /FROM bookings/);
  assert.deepEqual(events.slice(-2), ['rollback', 'release']);
  assert.ok(!events.includes('commit'));
});
