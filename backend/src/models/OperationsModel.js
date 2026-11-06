const pool = require('../config/db');
const Booking = require('./BookingModel');
const Notification = require('./NotificationModel');

/** Định dạng danh sách nhất quán, không đưa dữ liệu giả vào dashboard. */
function paged(rows, total, filter) { return { data: rows, meta: { page: filter.page, limit: filter.limit, total: Number(total), totalPages: Math.ceil(Number(total) / filter.limit) } }; }
/** Admin toàn quyền; Staff chỉ nhận nhóm dữ liệu được cấp quyền đọc tương ứng. */
function can(user, key) { return user.role === 'admin' || (user.permissions || []).includes(key); }

/** Tra lịch rồi khóa theo thứ tự cha, dùng lại quy tắc của booking. */
async function lockedTrip(scheduleId, work) { return Booking.withLockedSchedule(scheduleId, work); }

/** Chỉ thông báo cập nhật có ích cho khách đã xác nhận; ghi chú nội bộ không tạo email. */
async function notifyTrip(connection, scheduleId, title) {
  const [customers] = await connection.query("SELECT DISTINCT customer_id FROM bookings WHERE schedule_id=? AND status='confirmed'", [scheduleId]);
  for (const row of customers) await Notification.enqueue(connection, row.customer_id, { type: 'trip.updated', title: 'Cập nhật thông tin chuyến đi', message: `Thông tin tập trung/di chuyển hoặc hướng dẫn viên của tour ${title} vừa được cập nhật. Hãy mở booking để xem chi tiết.`, link: '/bookings' });
}

const Operations = {
  /** Dashboard phân quyền từng nhóm số liệu; doanh thu tiền thật và mock được tách rõ. */
  async dashboard(user, range) {
    const data = { range, metrics: {}, trend: [], topTours: [], recentBookings: [], upcomingTrips: [] };
    const dateParams = [range.from, range.to];
    if (can(user, 'bookings.read')) {
      const [[counts], [trend], [top], [recent]] = await Promise.all([
        pool.query("SELECT COUNT(*) AS total,COALESCE(SUM(status='pending'),0) AS pending,COALESCE(SUM(status='confirmed'),0) AS confirmed,COALESCE(SUM(status='cancelled'),0) AS cancelled,COALESCE(SUM(status='completed'),0) AS completed FROM bookings WHERE created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY)", dateParams),
        pool.query("SELECT DATE_FORMAT(created_at,'%Y-%m-%d') AS day,COUNT(*) AS bookings FROM bookings WHERE created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY) GROUP BY day ORDER BY day", dateParams),
        pool.query("SELECT t.id,t.title,COUNT(*) AS bookings,COALESCE(SUM(b.seat_count),0) AS seats FROM bookings b JOIN tour_schedules s ON s.id=b.schedule_id JOIN tours t ON t.id=s.tour_id WHERE b.status IN ('confirmed','completed') AND b.created_at>=? AND b.created_at<DATE_ADD(?,INTERVAL 1 DAY) GROUP BY t.id,t.title ORDER BY bookings DESC,t.id DESC LIMIT 5", dateParams),
        pool.query("SELECT b.id,b.booking_code,b.contact_name,b.total_price,b.status,t.title AS tour_title FROM bookings b JOIN tour_schedules s ON s.id=b.schedule_id JOIN tours t ON t.id=s.tour_id WHERE b.created_at>=? AND b.created_at<DATE_ADD(?,INTERVAL 1 DAY) ORDER BY b.id DESC LIMIT 6", dateParams)
      ]);
      data.metrics.bookings = Object.fromEntries(Object.entries(counts[0]).map(([key,value]) => [key, Number(value)]));
      data.trend = trend; data.topTours = top; data.recentBookings = recent;
    }
    if (can(user, 'payments.read')) {
      const [paid] = await pool.query("SELECT COALESCE(SUM(CASE WHEN payment_gateway<>'mock' THEN amount ELSE 0 END),0) AS gross,COALESCE(SUM(CASE WHEN payment_gateway='mock' THEN amount ELSE 0 END),0) AS mock FROM payments WHERE status='success' AND paid_at>=? AND paid_at<DATE_ADD(?,INTERVAL 1 DAY)", dateParams);
      const [refunds] = await pool.query("SELECT COALESCE(SUM(CASE WHEN p.payment_gateway<>'mock' THEN r.amount ELSE 0 END),0) AS returned,COALESCE(SUM(CASE WHEN p.payment_gateway='mock' THEN r.amount ELSE 0 END),0) AS mock_returned FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.status='success' AND r.processed_at>=? AND r.processed_at<DATE_ADD(?,INTERVAL 1 DAY)", dateParams);
      data.metrics.payments = { ...paid[0], ...refunds[0], currency: 'VND' };
    }
    if (can(user, 'tours.read')) {
      const [[tours]] = await pool.query("SELECT COUNT(*) AS total,COALESCE(SUM(status='active'),0) AS active FROM tours");
      data.metrics.tours = { total: Number(tours.total), active: Number(tours.active) };
    }
    if (user.role === 'admin') {
      const [[customers]] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role='customer'");
      data.metrics.customers = Number(customers.total);
      data.metrics.mail = await Notification.mailStats();
    }
    if (can(user, 'trips.read')) {
      const [trips] = await pool.query("SELECT s.id,s.departure_date,s.booked_seats,s.max_capacity,t.title AS tour_title,(SELECT COUNT(*) FROM schedule_guides sg WHERE sg.schedule_id=s.id) AS guide_count FROM tour_schedules s JOIN tours t ON t.id=s.tour_id WHERE s.departure_date>=CURRENT_TIMESTAMP AND s.status<>'cancelled' ORDER BY s.departure_date LIMIT 6");
      data.upcomingTrips = trips;
    }
    return data;
  },

  /** Danh sách hướng dẫn viên gồm liên hệ dành riêng cho người vận hành có quyền. */
  async guides(filter) {
    const conditions = [], params = [];
    if (filter.status) { conditions.push('status=?'); params.push(filter.status); }
    if (filter.q) { conditions.push('(full_name LIKE ? OR languages LIKE ?)'); params.push(`%${filter.q}%`, `%${filter.q}%`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [counts] = await pool.query(`SELECT COUNT(*) AS total FROM guides ${where}`, params);
    const [rows] = await pool.query(`SELECT * FROM guides ${where} ORDER BY full_name,id LIMIT ? OFFSET ?`, [...params, filter.limit, (filter.page - 1) * filter.limit]);
    return paged(rows, counts[0].total, filter);
  },

  /** Lưu hồ sơ, từ chối ngưng hoạt động khi vẫn được phân công chuyến tương lai. */
  async saveGuide(guideId, data) {
    return Booking.transaction(async connection => {
      if (guideId) {
        const [rows] = await connection.query('SELECT * FROM guides WHERE id=? FOR UPDATE', [guideId]);
        if (!rows[0]) throw Booking.error(404, 'Không tìm thấy hướng dẫn viên.');
        if (data.status === 'inactive') {
          const [assigned] = await connection.query("SELECT sg.schedule_id FROM schedule_guides sg JOIN tour_schedules s ON s.id=sg.schedule_id JOIN tours t ON t.id=s.tour_id WHERE sg.guide_id=? AND s.status<>'cancelled' AND COALESCE(s.return_date,DATE_ADD(DATE(s.departure_date),INTERVAL t.duration_days DAY))>=CURRENT_TIMESTAMP LIMIT 1", [guideId]);
          if (assigned[0]) throw Booking.error(409, 'Hãy gỡ phân công chuyến chưa kết thúc trước khi ngưng hướng dẫn viên.');
        }
      }
      const fields = Object.keys(data);
      if (guideId) await connection.query(`UPDATE guides SET ${fields.map(key => `\`${key}\`=?`).join(',')} WHERE id=?`, [...fields.map(key => data[key]), guideId]);
      else {
        const [result] = await connection.query(`INSERT INTO guides (${fields.map(key => `\`${key}\``).join(',')}) VALUES (${fields.map(() => '?').join(',')})`, fields.map(key => data[key])); guideId = String(result.insertId);
      }
      const [[guide]] = await connection.query('SELECT * FROM guides WHERE id=?', [guideId]);
      return guide;
    });
  },

  /** Lịch điều hành theo tour, không tạo bảng chuyến đi trùng tour_schedules. */
  async trips(filter) {
    const params = [], conditions = [];
    if (filter.status) { conditions.push('s.status=?'); params.push(filter.status); }
    if (filter.q) { conditions.push('(t.title LIKE ? OR s.meeting_point LIKE ?)'); params.push(`%${filter.q}%`, `%${filter.q}%`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const join = 'FROM tour_schedules s JOIN tours t ON t.id=s.tour_id';
    const [[counts], [rows]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total ${join} ${where}`, params),
      pool.query(`SELECT s.id,s.tour_id,s.departure_date,s.return_date,s.status,s.meeting_point,s.max_capacity,s.booked_seats,t.title AS tour_title,(SELECT COUNT(*) FROM schedule_guides sg WHERE sg.schedule_id=s.id) AS guide_count ${join} ${where} ORDER BY s.departure_date DESC,s.id DESC LIMIT ? OFFSET ?`, [...params, filter.limit, (filter.page - 1) * filter.limit])
    ]);
    return paged(rows, counts[0].total, filter);
  },

  /** Chi tiết vận hành; danh sách khách chỉ được thêm khi có bookings.read. */
  async trip(scheduleId, withManifest = false) {
    const [rows] = await pool.query('SELECT s.*,t.title AS tour_title,t.duration_days FROM tour_schedules s JOIN tours t ON t.id=s.tour_id WHERE s.id=?', [scheduleId]);
    if (!rows[0]) throw Booking.error(404, 'Không tìm thấy chuyến đi.');
    const [guides] = await pool.query('SELECT g.*,sg.is_lead FROM schedule_guides sg JOIN guides g ON g.id=sg.guide_id WHERE sg.schedule_id=? ORDER BY sg.is_lead DESC,g.full_name', [scheduleId]);
    let manifest = [];
    if (withManifest) [manifest] = await pool.query("SELECT b.id AS booking_id,b.booking_code,b.contact_name,b.contact_phone,b.status,p.id,p.full_name,p.passenger_type,p.occupies_seat FROM bookings b JOIN booking_passengers p ON p.booking_id=b.id WHERE b.schedule_id=? AND b.status IN ('confirmed','completed') ORDER BY b.id,p.id", [scheduleId]);
    return { ...rows[0], guides, manifest };
  },

  /** Nội dung thay đổi chỉ gửi cho khách của các booking đã xác nhận, không gửi Guest. */
  async updateTrip(scheduleId, data) {
    await lockedTrip(scheduleId, async ctx => {
      require('../validators/tourValidator').validateMergedSchedule({ ...ctx.schedule, ...data });
      const fields = Object.keys(data);
      await ctx.connection.query(`UPDATE tour_schedules SET ${fields.map(key => `\`${key}\`=?`).join(',')} WHERE id=?`, [...fields.map(key => data[key]), scheduleId]);
      if (fields.some(key => key !== 'notes' && String(data[key] ?? '') !== String(ctx.schedule[key] ?? ''))) await notifyTrip(ctx.connection, scheduleId, ctx.tour.title);
    });
    return this.trip(scheduleId);
  },

  /**
   * Khóa guide trước khi đọc lịch phân công để hai chuyến không thể cùng chiếm một guide.
   * Truy vấn xung đột là read sau khóa guide; booking không bao giờ lấy khóa guide ngược lại.
   */
  async assignGuide(scheduleId, guideId, isLead, remove = false) {
    const [parents] = await pool.query('SELECT tour_id FROM tour_schedules WHERE id=?', [scheduleId]);
    if (!parents[0]) throw Booking.error(404, 'Không tìm thấy chuyến đi.');
    await Booking.transaction(async connection => {
      const [guides] = await connection.query('SELECT * FROM guides WHERE id=? FOR UPDATE', [guideId]);
      if (!guides[0]) throw Booking.error(404, 'Không tìm thấy hướng dẫn viên.');
      const [[tour]] = await connection.query('SELECT id,duration_days,title FROM tours WHERE id=? FOR UPDATE', [parents[0].tour_id]);
      const [[schedule]] = await connection.query('SELECT * FROM tour_schedules WHERE id=? FOR UPDATE', [scheduleId]);
      if (!schedule) throw Booking.error(404, 'Không tìm thấy chuyến đi.');
      if (remove) { const [removed] = await connection.query('DELETE FROM schedule_guides WHERE schedule_id=? AND guide_id=?', [scheduleId, guideId]); if (removed.affectedRows) await notifyTrip(connection, scheduleId, tour.title); return; }
      if (guides[0].status !== 'active' || schedule.status === 'cancelled') throw Booking.error(409, 'Hướng dẫn viên hoặc chuyến đi không còn khả dụng.');
      const end = schedule.return_date || new Date(Date.parse(schedule.departure_date.slice(0, 10) + 'T00:00:00+07:00') + Number(tour.duration_days) * 86400000 + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
      const [conflicts] = await connection.query("SELECT sg.schedule_id FROM schedule_guides sg JOIN tour_schedules s ON s.id=sg.schedule_id JOIN tours t ON t.id=s.tour_id WHERE sg.guide_id=? AND s.id<>? AND s.status<>'cancelled' AND s.departure_date<? AND COALESCE(s.return_date,DATE_ADD(DATE(s.departure_date),INTERVAL t.duration_days DAY))>? LIMIT 1", [guideId, scheduleId, end, schedule.departure_date]);
      if (conflicts[0]) throw Booking.error(409, 'Hướng dẫn viên đã có chuyến khác trong khoảng thời gian này.');
      if (isLead) await connection.query('UPDATE schedule_guides SET is_lead=0 WHERE schedule_id=?', [scheduleId]);
      await connection.query('INSERT INTO schedule_guides (schedule_id,guide_id,is_lead) VALUES (?,?,?) ON DUPLICATE KEY UPDATE is_lead=VALUES(is_lead)', [scheduleId, guideId, isLead ? 1 : 0]);
      await notifyTrip(connection, scheduleId, tour.title);
    });
    return this.trip(scheduleId);
  },

  /** Hoàn thành chuyến đã kết thúc, lưu lịch sử cho từng đơn và mở điều kiện đánh giá. */
  async completeTrip(scheduleId, actorId) {
    return lockedTrip(scheduleId, async ctx => {
      const [[clock]] = await ctx.connection.query('SELECT COALESCE(return_date,DATE_ADD(DATE(departure_date),INTERVAL ? DAY))<=CURRENT_TIMESTAMP AS finished FROM tour_schedules WHERE id=?', [ctx.tour.duration_days, scheduleId]);
      if (Number(clock.finished) !== 1 || ctx.schedule.status === 'cancelled') throw Booking.error(409, 'Chỉ hoàn thành chuyến sau thời điểm kết thúc hợp lệ.');
      const [bookings] = await ctx.connection.query("SELECT * FROM bookings WHERE schedule_id=? AND status IN ('pending','confirmed') ORDER BY id FOR UPDATE", [scheduleId]);
      let completed = 0;
      for (const booking of bookings) {
        const bookingCtx = { ...ctx, booking };
        if (booking.status === 'pending') { await require('../services/bookingService').expireLocked(bookingCtx); continue; }
        await ctx.connection.query("UPDATE bookings SET status='completed' WHERE id=? AND status='confirmed'", [booking.id]);
        await Booking.history(bookingCtx, 'confirmed', 'completed', actorId, 'Nhân viên xác nhận chuyến đi đã hoàn thành.'); completed++;
      }
      await ctx.connection.query("UPDATE tour_schedules SET status='closed' WHERE id=?", [scheduleId]);
      return { schedule_id: String(scheduleId), completed };
    });
  },

  /** Khách đã xác nhận/hoàn thành chỉ nhận thông tin của chuyến thuộc booking chính mình. */
  async customerTrip(bookingId, customerId) {
    const [rows] = await pool.query("SELECT s.id,s.departure_date,s.return_date,s.meeting_point,s.meeting_time,s.transport_info,s.accommodation_info,s.emergency_phone,s.customer_instructions FROM bookings b JOIN tour_schedules s ON s.id=b.schedule_id WHERE b.id=? AND b.customer_id=? AND b.status IN ('confirmed','completed')", [bookingId, customerId]);
    if (!rows[0]) throw Booking.error(404, 'Chưa có thông tin chuyến đi cho booking này.');
    const [guides] = await pool.query('SELECT g.full_name,g.phone,g.languages,sg.is_lead FROM schedule_guides sg JOIN guides g ON g.id=sg.guide_id WHERE sg.schedule_id=? ORDER BY sg.is_lead DESC,g.full_name', [rows[0].id]);
    return { ...rows[0], guides };
  }
};

module.exports = Operations;
