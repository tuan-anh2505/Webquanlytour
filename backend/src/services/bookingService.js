const BookingModel = require('../models/BookingModel');
const validate = require('../validators/bookingValidator');
const MAX_MONEY = 999999999999n;

/** Đổi DECIMAL(12,2) sang số nguyên xu để tính toán mà không sai số dấu phẩy động. */
function toCents(value) {
  if (!['string', 'number'].includes(typeof value) || !/^\d{1,10}(\.\d{1,2})?$/.test(String(value))) throw BookingModel.error(409, 'Giá tour đang không hợp lệ.');
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/** Định dạng xu về chuỗi DECIMAL để lưu và trả API, không dùng Number cho số tiền. */
function fromCents(value) { return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`; }

/** Tính snapshot giá theo loại hành khách; infant không chiếm ghế trong chính sách hiện tại. */
function pricePassengers(input, tour, schedule) {
  let total = 0n, seatCount = 0;
  const prices = {
    adult: schedule.adult_price_override ?? tour.base_price,
    child: schedule.child_price_override ?? tour.child_price,
    infant: schedule.infant_price_override ?? tour.infant_price
  };
  const passengers = input.map(passenger => {
    const price = toCents(prices[passenger.passenger_type]);
    total += price;
    const occupies_seat = passenger.passenger_type === 'infant' ? 0 : 1;
    seatCount += occupies_seat;
    return { ...passenger, occupies_seat, unit_price: fromCents(price) };
  });
  if (total > MAX_MONEY) throw BookingModel.error(400, 'Tổng tiền vượt giới hạn hỗ trợ của một booking.');
  return { passengers, seatCount, total: fromCents(total), free: total === 0n };
}

/** Dựng payload chuẩn từ bản ghi cũ để cùng một khóa retry không thể tạo một đơn khác. */
function canonicalRequest(booking, passengers) {
  return JSON.stringify({
    schedule_id: String(booking.schedule_id), contact_name: booking.contact_name,
    contact_email: booking.contact_email, contact_phone: booking.contact_phone,
    customer_note: booking.customer_note ?? null,
    passengers: passengers.map(item => ({
      full_name: item.full_name, passenger_type: item.passenger_type, date_of_birth: item.date_of_birth ?? null,
      gender: item.gender ?? null, document_type: item.document_type ?? null, document_number: item.document_number ?? null
    }))
  });
}

/** Kiểm tra chính chủ trước khi trả lại booking từ khóa idempotency đã dùng. */
async function verifyReplay(booking, customerId, input, connection = null) {
  if (String(booking.customer_id) !== String(customerId)) throw BookingModel.error(404, 'Không tìm thấy booking.');
  let passengers;
  if (connection) {
    [passengers] = await connection.query('SELECT full_name,passenger_type,date_of_birth,gender,document_type,document_number FROM booking_passengers WHERE booking_id=? ORDER BY id', [booking.id]);
  } else {
    const existing = await BookingModel.detail(booking.id, { customerId });
    passengers = existing.passengers;
  }
  if (canonicalRequest(booking, passengers) !== canonicalRequest(input, input.passengers)) {
    throw BookingModel.error(409, 'Khóa yêu cầu đã được dùng với thông tin khác. Vui lòng tạo yêu cầu mới.');
  }
  return { id: String(booking.id), replay: true };
}

/** Đảm bảo mọi thao tác của Customer dựa trên ID từ token, không dựa vào body hoặc query. */
function assertOwner(ctx, { customerId, operator = false }) {
  if (!operator && (!customerId || String(ctx.booking.customer_id) !== String(customerId))) throw BookingModel.error(404, 'Không tìm thấy booking.');
}

/** Xác định hạn giữ chỗ theo đồng hồ DB và giới hạn bởi giờ khởi hành. */
function holdDeadline(now, departureDate) {
  const minutes = Number(process.env.BOOKING_HOLD_MINUTES || 15);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw BookingModel.error(500, 'Cấu hình thời gian giữ chỗ không hợp lệ.');
  const date = new Date(`${now.replace(' ', 'T')}+07:00`);
  const local = new Date(date.valueOf() + minutes * 60000 + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  return local < departureDate ? local : departureDate;
}

/** Hết hạn một đơn đang pending đúng một lần, trả chỗ và lưu lịch sử cùng transaction. */
async function expireLocked(ctx) {
  if (ctx.booking.status !== 'pending') return false;
  const due = (ctx.booking.hold_expires_at && ctx.booking.hold_expires_at <= ctx.now) ||
    ctx.schedule.departure_date <= ctx.now || ctx.schedule.status === 'cancelled';
  if (!due) return false;
  await BookingModel.releaseSeats(ctx);
  await ctx.connection.query("UPDATE bookings SET status='expired',hold_expires_at=NULL WHERE id=? AND status='pending'", [ctx.booking.id]);
  await BookingModel.history(ctx, 'pending', 'expired', null, 'Hết hạn giữ chỗ hoặc lịch khởi hành không còn khả dụng.');
  ctx.booking.status = 'expired';
  ctx.booking.hold_expires_at = null;
  return true;
}

/** Xác nhận đơn đã trả đủ tiền/không thu phí; không tăng chỗ vì chỗ đã giữ khi tạo đơn. */
async function confirmLocked(ctx, { actorId = null, note = 'Thanh toán thành công, booking được xác nhận.' } = {}) {
  if (ctx.booking.status === 'confirmed') return ctx.booking;
  if (ctx.booking.status !== 'pending' ||
      (ctx.booking.hold_expires_at && ctx.booking.hold_expires_at <= ctx.now) ||
      ctx.schedule.departure_date <= ctx.now || ctx.schedule.status === 'cancelled') {
    throw BookingModel.error(409, 'Booking không còn đủ điều kiện xác nhận.');
  }
  if (toCents(ctx.booking.total_price) > 0n) {
    const [payments] = await ctx.connection.query("SELECT id,amount,currency FROM payments WHERE booking_id=? AND status='success' ORDER BY id FOR UPDATE", [ctx.booking.id]);
    const correctPayment = payments.some(payment => payment.currency === ctx.booking.currency && toCents(payment.amount) === toCents(ctx.booking.total_price));
    if (!correctPayment) throw BookingModel.error(409, 'Booking cần khoản thanh toán thành công đúng số tiền và loại tiền trước khi xác nhận.');
  }
  const [updated] = await ctx.connection.query("UPDATE bookings SET status='confirmed',confirmed_at=?,hold_expires_at=NULL WHERE id=? AND status='pending'", [ctx.now, ctx.booking.id]);
  if (updated.affectedRows !== 1) throw BookingModel.error(409, 'Booking vừa thay đổi. Vui lòng tải lại.');
  await BookingModel.history(ctx, 'pending', 'confirmed', actorId, note);
  Object.assign(ctx.booking, { status: 'confirmed', confirmed_at: ctx.now, hold_expires_at: null });
  return ctx.booking;
}

/** Thu hồi các hold cũ trên một lịch đã khóa để đơn mới không bị báo hết chỗ giả. */
async function expireScheduleHolds(ctx) {
  const [bookings] = await ctx.connection.query("SELECT * FROM bookings WHERE schedule_id=? AND status='pending' AND (hold_expires_at<=? OR ?<=? OR ?='cancelled') ORDER BY id FOR UPDATE",
    [ctx.schedule.id, ctx.now, ctx.schedule.departure_date, ctx.now, ctx.schedule.status]);
  for (const booking of bookings) await expireLocked({ ...ctx, booking });
}

/** Tạo booking và snapshot hành khách với khóa lịch; retry cùng UUID không giữ thêm chỗ. */
async function createBooking(customerId, body, requestKey) {
  customerId = validate.id(customerId, 'Khách hàng');
  const input = validate.create(body);
  const code = `BK-${validate.idempotencyKey(requestKey)}`;
  const existing = await BookingModel.byCode(code);
  let result;
  if (existing) result = await verifyReplay(existing, customerId, input);
  else {
    try {
      result = await BookingModel.withLockedSchedule(input.schedule_id, async ctx => {
        const duplicate = await BookingModel.byCode(code, ctx.connection, true);
        if (duplicate) return verifyReplay(duplicate, customerId, input, ctx.connection);
        await expireScheduleHolds(ctx);
        // Trả lỗi sau commit để việc thu hồi hold cũ không bị rollback cùng yêu cầu mới thất bại.
        if (ctx.tour.status !== 'active' || ctx.schedule.status !== 'open' || ctx.schedule.departure_date <= ctx.now) {
          return { error: BookingModel.error(409, 'Lịch khởi hành không còn mở để đặt tour.') };
        }
        let pricing;
        try { pricing = pricePassengers(input.passengers, ctx.tour, ctx.schedule); }
        catch (cause) { if (cause.status >= 400 && cause.status < 500) return { error: cause }; throw cause; }
        if (Number(ctx.schedule.booked_seats) + pricing.seatCount > Number(ctx.schedule.max_capacity)) {
          return { error: BookingModel.error(409, 'Lịch khởi hành không còn đủ chỗ. Vui lòng chọn lịch khác.') };
        }
        const [reserved] = await ctx.connection.query("UPDATE tour_schedules SET booked_seats=booked_seats+? WHERE id=? AND status='open' AND booked_seats+?<=max_capacity", [pricing.seatCount, ctx.schedule.id, pricing.seatCount]);
        if (reserved.affectedRows !== 1) return { error: BookingModel.error(409, 'Số chỗ vừa thay đổi. Vui lòng thử lại.') };
        const status = pricing.free ? 'confirmed' : 'pending';
        const deadline = pricing.free ? null : holdDeadline(ctx.now, ctx.schedule.departure_date);
        const [inserted] = await ctx.connection.query(`INSERT INTO bookings
          (booking_code,customer_id,schedule_id,contact_name,contact_email,contact_phone,seat_count,subtotal,discount_amount,total_price,currency,status,hold_expires_at,confirmed_at,customer_note)
          VALUES (?,?,?,?,?,?,?,?,0,?,'VND',?,?,?,?)`,
          [code, customerId, input.schedule_id, input.contact_name, input.contact_email, input.contact_phone, pricing.seatCount, pricing.total, pricing.total, status, deadline, pricing.free ? ctx.now : null, input.customer_note]);
        const bookingId = String(inserted.insertId);
        ctx.booking = { id: bookingId, status, seat_count: pricing.seatCount };
        for (const passenger of pricing.passengers) {
          await ctx.connection.query(`INSERT INTO booking_passengers
            (booking_id,full_name,passenger_type,date_of_birth,gender,document_type,document_number,occupies_seat,unit_price) VALUES (?,?,?,?,?,?,?,?,?)`,
            [bookingId, passenger.full_name, passenger.passenger_type, passenger.date_of_birth, passenger.gender, passenger.document_type, passenger.document_number, passenger.occupies_seat, passenger.unit_price]);
        }
        await BookingModel.history(ctx, null, status, customerId, pricing.free ? 'Booking không thu phí được xác nhận.' : 'Đã tạo booking và giữ chỗ tạm thời.');
        return { id: bookingId, replay: false };
      });
    } catch (cause) {
      if (cause.code !== 'ER_DUP_ENTRY') throw cause;
      // Hai request cùng key có thể bắt đầu trên hai lịch khác nhau; unique code bảo vệ bước cuối.
      const duplicate = await BookingModel.byCode(code);
      if (!duplicate) throw cause;
      result = await verifyReplay(duplicate, customerId, input);
    }
  }
  if (result.error) throw result.error;
  return { booking: await BookingModel.detail(result.id, { customerId }), replay: result.replay };
}

/** Hủy pending/confirmed trước giờ đi, trả chỗ một lần và đề nghị hoàn các khoản đã thu. */
async function cancelBooking(bookingId, { customerId = null, actorId = null, operator = false, reason } = {}) {
  const result = await BookingModel.withLockedBooking(bookingId, async ctx => {
    assertOwner(ctx, { customerId, operator });
    await expireLocked(ctx);
    if (ctx.booking.status === 'cancelled') return { id: ctx.booking.id };
    if (!['pending', 'confirmed'].includes(ctx.booking.status) || ctx.schedule.departure_date <= ctx.now) {
      return { error: BookingModel.error(409, 'Booking không còn đủ điều kiện hủy trực tuyến.') };
    }
    const oldStatus = ctx.booking.status;
    const note = validate.cancellation({ reason });
    await BookingModel.releaseSeats(ctx);
    await ctx.connection.query("UPDATE bookings SET status='cancelled',cancelled_at=?,cancellation_reason=?,hold_expires_at=NULL WHERE id=?", [ctx.now, note, ctx.booking.id]);
    await BookingModel.history(ctx, oldStatus, 'cancelled', actorId || customerId, note);
    ctx.booking.status = 'cancelled';
    const [payments] = await ctx.connection.query("SELECT * FROM payments WHERE booking_id=? AND status='success' ORDER BY id FOR UPDATE", [ctx.booking.id]);
    for (const payment of payments) await BookingModel.requestRefundLocked(ctx, payment, note);
    return { id: ctx.booking.id };
  });
  if (result.error) throw result.error;
  return BookingModel.detail(result.id, { customerId, operator });
}

/** Nhân viên chỉ xác nhận đơn đã trả tiền; hold hết hạn vẫn được commit trước khi báo xung đột. */
async function confirmBooking(bookingId, { actorId, note } = {}) {
  const result = await BookingModel.withLockedBooking(bookingId, async ctx => {
    if (await expireLocked(ctx)) return { error: BookingModel.error(409, 'Booking đã hết hạn giữ chỗ.') };
    await confirmLocked(ctx, { actorId, note: validate.confirmation({ note }) });
    return { id: ctx.booking.id };
  });
  if (result.error) throw result.error;
  return BookingModel.detail(result.id, { operator: true });
}

/** Xem đơn có thu hồi hold hết hạn, nhưng kiểm tra chính chủ trước mọi tác động nghiệp vụ. */
async function getBooking(bookingId, options) {
  await BookingModel.withLockedBooking(bookingId, async ctx => {
    assertOwner(ctx, options);
    await expireLocked(ctx);
  });
  return BookingModel.detail(bookingId, options);
}

/** Job chọn ID không giữ khóa, xử lý từng đơn theo thứ tự khóa chung, an toàn với nhiều worker. */
async function expireDueBookings({ limit = 100 } = {}) {
  const bounded = Math.min(1000, Math.max(1, Number.isSafeInteger(limit) ? limit : 100));
  // Pool chỉ được dùng để tra ứng viên; mọi thay đổi đi qua withLockedBooking.
  const pool = require('../config/db');
  const [rows] = await pool.query(`SELECT b.id FROM bookings b JOIN tour_schedules s ON s.id=b.schedule_id
    WHERE b.status='pending' AND (b.hold_expires_at<=CURRENT_TIMESTAMP OR s.departure_date<=CURRENT_TIMESTAMP OR s.status='cancelled') ORDER BY b.id LIMIT ?`, [bounded]);
  let expired = 0, failed = 0;
  const failureCodes = new Set();
  for (const row of rows) {
    try { if (await BookingModel.withLockedBooking(row.id, expireLocked)) expired++; }
    catch (cause) {
      if (cause.status === 404) continue;
      failed++;
      failureCodes.add(cause.code || `HTTP_${cause.status || 500}`);
    }
  }
  return { expired, checked: rows.length, failed, failureCodes: [...failureCodes] };
}

module.exports = { createBooking, cancelBooking, confirmBooking, getBooking, expireDueBookings, expireLocked, confirmLocked, toCents, fromCents, pricePassengers };
