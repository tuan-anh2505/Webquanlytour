const pool = require('../config/db');
const validate = require('../validators/bookingValidator');

/** Lỗi nghiệp vụ an toàn, dùng chung giữa model và các service đặt tour/thanh toán. */
function error(status, message) { return Object.assign(new Error(message), { status }); }

/** Transaction nhỏ, retry deadlock có giới hạn; callback không được gọi dịch vụ mạng bên ngoài. */
async function transaction(work) {
  for (let attempt = 0; ; attempt++) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const value = await work(connection);
      await connection.commit();
      return value;
    } catch (cause) {
      await connection.rollback();
      if (cause.code !== 'ER_LOCK_DEADLOCK' || attempt >= 2) throw cause;
    } finally { connection.release(); }
  }
}

/** Đọc đồng hồ MySQL trong transaction, cùng múi giờ +07 với các DATETIME nghiệp vụ. */
async function databaseNow(connection) {
  const [rows] = await connection.query("SELECT DATE_FORMAT(CURRENT_TIMESTAMP, '%Y-%m-%d %H:%i:%s') AS now");
  return rows[0].now;
}

/** Khóa cha theo thứ tự tour -> schedule, đồng nhất với chức năng sửa lịch đã tồn tại. */
async function lockSchedule(connection, tourId, scheduleId) {
  const [tours] = await connection.query('SELECT * FROM tours WHERE id=? FOR UPDATE', [tourId]);
  const [schedules] = await connection.query('SELECT * FROM tour_schedules WHERE id=? FOR UPDATE', [scheduleId]);
  if (!tours[0] || !schedules[0] || String(schedules[0].tour_id) !== String(tourId)) throw error(404, 'Không tìm thấy lịch khởi hành.');
  return { connection, tour: tours[0], schedule: schedules[0], booking: null, now: await databaseNow(connection) };
}

const BookingModel = {
  error, transaction,

  /** Lấy khóa lịch trước khi tạo đơn; truy vấn đầu chỉ tra quan hệ bất biến, không giữ khóa ngược. */
  async withLockedSchedule(scheduleId, work) {
    const [rows] = await pool.query('SELECT id,tour_id FROM tour_schedules WHERE id=?', [scheduleId]);
    if (!rows[0]) throw error(404, 'Không tìm thấy lịch khởi hành.');
    return transaction(async connection => work(await lockSchedule(connection, rows[0].tour_id, scheduleId)));
  },

  /** Điểm vào chung cho booking/payment/expiry, luôn khóa tour -> schedule -> booking. */
  async withLockedBooking(bookingId, work) {
    bookingId = validate.id(bookingId, 'Booking');
    const [parents] = await pool.query('SELECT b.id,b.schedule_id,s.tour_id FROM bookings b JOIN tour_schedules s ON s.id=b.schedule_id WHERE b.id=?', [bookingId]);
    if (!parents[0]) throw error(404, 'Không tìm thấy booking.');
    return transaction(async connection => {
      const ctx = await lockSchedule(connection, parents[0].tour_id, parents[0].schedule_id);
      const [rows] = await connection.query('SELECT * FROM bookings WHERE id=? FOR UPDATE', [bookingId]);
      if (!rows[0] || String(rows[0].schedule_id) !== String(ctx.schedule.id)) throw error(404, 'Không tìm thấy booking.');
      ctx.booking = rows[0];
      return work(ctx);
    });
  },

  /** Tra mã retry, không dùng kết quả này để bỏ qua kiểm tra chủ sở hữu ở service. */
  async byCode(bookingCode, connection = pool, lock = false) {
    const [rows] = await connection.query(`SELECT * FROM bookings WHERE booking_code=?${lock ? ' FOR UPDATE' : ''}`, [bookingCode]);
    return rows[0];
  },

  /** Ghi lịch sử trong cùng transaction với thay đổi trạng thái và số chỗ. */
  async history(ctx, oldStatus, newStatus, actorId, note) {
    await ctx.connection.query('INSERT INTO booking_status_history (booking_id,changed_by,old_status,new_status,note) VALUES (?,?,?,?,?)',
      [ctx.booking.id, actorId || null, oldStatus, newStatus, note]);
  },

  /** Trả chỗ chính xác; nếu counter lệch sẽ rollback thay vì âm thầm ép về 0. */
  async releaseSeats(ctx) {
    const count = Number(ctx.booking.seat_count);
    const [result] = await ctx.connection.query('UPDATE tour_schedules SET booked_seats=booked_seats-? WHERE id=? AND booked_seats>=?', [count, ctx.schedule.id, count]);
    if (result.affectedRows !== 1) throw error(409, 'Số chỗ đang không nhất quán. Vui lòng liên hệ quản trị.');
    ctx.schedule.booked_seats = Number(ctx.schedule.booked_seats) - count;
  },

  /** Yêu cầu hoàn tiền được serialize bởi khóa booking/payment; không tự xác nhận tiền đã về. */
  async requestRefundLocked(ctx, payment, reason) {
    if (String(payment.booking_id) !== String(ctx.booking.id) || payment.status !== 'success') throw error(409, 'Khoản thanh toán chưa đủ điều kiện hoàn tiền.');
    // Luôn khóa payment trước refund, kể cả khi caller đã giữ khóa này.
    const [payments] = await ctx.connection.query('SELECT id,booking_id,amount,status FROM payments WHERE id=? AND booking_id=? FOR UPDATE', [payment.id, ctx.booking.id]);
    if (!payments[0] || payments[0].status !== 'success') throw error(409, 'Khoản thanh toán chưa đủ điều kiện hoàn tiền.');
    const [existing] = await ctx.connection.query('SELECT * FROM refunds WHERE payment_id=? ORDER BY id FOR UPDATE', [payment.id]);
    // Chỉ tính tiền đã hoàn hoặc đang được xử lý; refund failed không làm mất quyền yêu cầu lại.
    const cents = value => { const [whole, fraction = ''] = String(value).split('.'); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')); };
    const activeRefunds = existing.filter(row => ['requested', 'processing', 'success'].includes(row.status));
    const covered = activeRefunds.reduce((sum, row) => sum + cents(row.amount), 0n);
    const paid = cents(payments[0].amount);
    if (covered > paid) throw error(409, 'Tổng hoàn tiền đang không nhất quán. Vui lòng liên hệ quản trị.');
    if (covered === paid) return activeRefunds[0];
    const remaining = paid - covered;
    const amount = `${remaining / 100n}.${String(remaining % 100n).padStart(2, '0')}`;
    const [result] = await ctx.connection.query("INSERT INTO refunds (payment_id,amount,reason,status) VALUES (?,?,?,'requested')", [payment.id, amount, String(reason).slice(0, 500)]);
    return { id: String(result.insertId), payment_id: String(payment.id), amount, reason, status: 'requested' };
  },

  /** Danh sách chỉ có thông tin tóm tắt, không trả giấy tờ hoặc tên từng hành khách. */
  async list(filters, { customerId = null, operator = false } = {}) {
    if (!operator && !customerId) throw error(403, 'Không có quyền đọc booking.');
    const clauses = [], params = [];
    if (!operator) { clauses.push('b.customer_id=?'); params.push(customerId); }
    if (filters.status) { clauses.push('b.status=?'); params.push(filters.status); }
    if (filters.q) { clauses.push('(b.booking_code LIKE ? OR t.title LIKE ? OR b.contact_name LIKE ?)'); params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const join = 'FROM bookings b JOIN tour_schedules s ON s.id=b.schedule_id JOIN tours t ON t.id=s.tour_id';
    const [count] = await pool.query(`SELECT COUNT(*) AS total ${join} ${where}`, params);
    const [rows] = await pool.query(`SELECT b.id,b.booking_code,b.customer_id,b.schedule_id,b.contact_name,b.contact_email,b.contact_phone,
      b.seat_count,b.subtotal,b.discount_amount,b.total_price,b.currency,b.status,b.hold_expires_at,b.confirmed_at,b.cancelled_at,b.created_at,b.updated_at,
      t.title AS tour_title,t.slug AS tour_slug,s.departure_date,s.return_date,
      (SELECT COUNT(*) FROM booking_passengers bp WHERE bp.booking_id=b.id) AS passenger_count,
      CASE WHEN EXISTS(SELECT 1 FROM payments p WHERE p.booking_id=b.id AND p.status='success') THEN 'success'
        WHEN EXISTS(SELECT 1 FROM payments p WHERE p.booking_id=b.id AND p.status='processing') THEN 'processing'
        WHEN EXISTS(SELECT 1 FROM payments p WHERE p.booking_id=b.id AND p.status='failed') THEN 'failed' ELSE 'unpaid' END AS payment_status
      ${join} ${where} ORDER BY b.created_at DESC,b.id DESC LIMIT ? OFFSET ?`, [...params, filters.limit, (filters.page - 1) * filters.limit]);
    const total = Number(count[0].total);
    return { data: rows, meta: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
  },

  /** Chi tiết chỉ dành cho chính chủ hoặc người vận hành đã được router kiểm tra quyền. */
  async detail(bookingId, { customerId = null, operator = false } = {}) {
    bookingId = validate.id(bookingId, 'Booking');
    if (!operator && !customerId) throw error(403, 'Không có quyền đọc booking.');
    const ownership = operator ? '' : ' AND b.customer_id=?';
    const [rows] = await pool.query(`SELECT b.*,t.title AS tour_title,t.slug AS tour_slug,s.departure_date,s.return_date,
      DATE_FORMAT(CURRENT_TIMESTAMP, '%Y-%m-%d %H:%i:%s') AS server_now
      FROM bookings b JOIN tour_schedules s ON s.id=b.schedule_id JOIN tours t ON t.id=s.tour_id
      WHERE b.id=?${ownership}`, operator ? [bookingId] : [bookingId, customerId]);
    if (!rows[0]) throw error(404, 'Không tìm thấy booking.');
    const [[passengers], [history], [payments], [refunds]] = await Promise.all([
      pool.query('SELECT id,booking_id,full_name,passenger_type,date_of_birth,gender,document_type,document_number,occupies_seat,unit_price FROM booking_passengers WHERE booking_id=? ORDER BY id', [bookingId]),
      pool.query('SELECT id,changed_by,old_status,new_status,note,created_at FROM booking_status_history WHERE booking_id=? ORDER BY id', [bookingId]),
      pool.query('SELECT id,payment_reference,payment_gateway,amount,currency,status,paid_at,created_at FROM payments WHERE booking_id=? ORDER BY id DESC', [bookingId]),
      pool.query('SELECT r.id,r.payment_id,r.amount,r.reason,r.status,r.created_at,r.processed_at FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.booking_id=? ORDER BY r.id DESC', [bookingId])
    ]);
    return { ...rows[0], passengers, history, payments, refunds };
  }
};

module.exports = BookingModel;
