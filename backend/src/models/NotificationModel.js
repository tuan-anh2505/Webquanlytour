const pool = require('../config/db');
const Booking = require('./BookingModel');
const { randomUUID } = require('node:crypto');
const { getMailConfig } = require('../config/mail');

/** Ghi thông báo và email outbox trong cùng transaction với thay đổi nghiệp vụ. */
async function enqueue(connection, userId, event) {
  if (event.dedupe) {
    const [existing] = await connection.query('SELECT id FROM notifications WHERE user_id=? AND type=? AND link_url=? LIMIT 1', [userId, event.type, event.link]);
    if (existing[0]) return existing[0].id;
  }
  const [users] = await connection.query('SELECT id,email,status FROM users WHERE id=?', [userId]);
  if (!users[0] || users[0].status !== 'active') return null;
  const [result] = await connection.query('INSERT INTO notifications (user_id,type,title,message,link_url) VALUES (?,?,?,?,?)', [userId, event.type, event.title, event.message, event.link || null]);
  const notificationId = String(result.insertId);
  if (getMailConfig().mode !== 'disabled' && event.email !== false) {
    const payload = JSON.stringify({ notificationId, to: users[0].email, subject: event.title, text: event.message, link: event.link || null, attempts: 0 });
    await connection.query("INSERT INTO notifications (user_id,type,title,message,link_url) VALUES (?,'mail.pending',?,?,?)", [userId, event.title, payload, event.link || null]);
  }
  return notificationId;
}

const Notification = {
  enqueue,

  /** Hook trạng thái booking: không ghi lại một sự kiện đã xử lý, không chứa giấy tờ/mật khẩu. */
  async bookingEvent(ctx, status) {
    const labels = { pending: 'Đã tạo booking và giữ chỗ', confirmed: 'Booking đã được xác nhận', cancelled: 'Booking đã được hủy', expired: 'Booking đã hết hạn giữ chỗ', completed: 'Hành trình đã hoàn thành' };
    if (!labels[status]) return;
    const [rows] = await ctx.connection.query(`SELECT b.customer_id,b.booking_code,t.title AS tour_title,u.email AS notification_email
      FROM bookings b JOIN tour_schedules s ON s.id=b.schedule_id JOIN tours t ON t.id=s.tour_id JOIN users u ON u.id=b.customer_id WHERE b.id=?`, [ctx.booking.id]);
    if (!rows[0]) return;
    const booking = rows[0];
    const extra = status === 'pending' ? 'Vui lòng thanh toán trước hạn giữ chỗ trên booking.' : status === 'completed' ? 'Bạn có thể gửi đánh giá về tour trong tài khoản.' : 'Mở booking để xem thông tin cập nhật và trạng thái thanh toán/hoàn tiền.';
    await enqueue(ctx.connection, booking.customer_id, { type: `booking.${status}`, title: labels[status], message: `${booking.booking_code} — ${booking.tour_title}. ${extra}`, link: `/bookings/${ctx.booking.id}`, dedupe: true });
    if (status === 'pending') {
      const [operators] = await ctx.connection.query("SELECT DISTINCT u.id FROM users u LEFT JOIN staff_permissions sp ON sp.user_id=u.id AND sp.permission_key='bookings.read' WHERE u.status='active' AND (u.role='admin' OR (u.role='staff' AND sp.user_id IS NOT NULL)) ORDER BY u.id LIMIT 500");
      for (const operator of operators) await enqueue(ctx.connection, operator.id, { type: 'operations.new_booking', title: 'Có booking mới', message: `${booking.booking_code} — ${booking.tour_title}.`, link: `/admin/bookings/${ctx.booking.id}`, dedupe: true, email: false });
    }
  },

  /** Outbox mail là dữ liệu nội bộ, luôn bị loại khỏi danh sách thông báo người dùng. */
  async list(userId, filter) {
    const where = "user_id=? AND type NOT LIKE 'mail.%'";
    const [[count], [rows]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total,COALESCE(SUM(is_read=0),0) AS unread FROM notifications WHERE ${where}`, [userId]),
      pool.query(`SELECT id,type,title,message,link_url,is_read,created_at FROM notifications WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [userId, filter.limit, (filter.page - 1) * filter.limit])
    ]);
    const total = Number(count[0].total);
    return { data: rows, unread: Number(count[0].unread), meta: { page: filter.page, limit: filter.limit, total, totalPages: Math.ceil(total / filter.limit) } };
  },

  /** Đánh dấu đọc chỉ trong tài khoản hiện tại, không nhận user_id từ client. */
  async markRead(userId, notificationId = null) {
    if (notificationId) {
      const [rows] = await pool.query("SELECT id FROM notifications WHERE id=? AND user_id=? AND type NOT LIKE 'mail.%'", [notificationId, userId]);
      if (!rows[0]) throw Booking.error(404, 'Không tìm thấy thông báo.');
    }
    await pool.query(`UPDATE notifications SET is_read=1 WHERE user_id=? AND type NOT LIKE 'mail.%'${notificationId ? ' AND id=?' : ''}`, notificationId ? [userId, notificationId] : [userId]);
    return { read: true };
  },

  /** Claim một email bằng khóa row; lease cho phép khôi phục khi tiến trình dừng đột ngột. */
  async claimMail() {
    return Booking.transaction(async connection => {
      const [rows] = await connection.query("SELECT id,user_id,message FROM notifications WHERE (type='mail.pending' AND created_at<=CURRENT_TIMESTAMP) OR (type='mail.sending' AND created_at<DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 10 MINUTE)) ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED");
      if (!rows[0]) return null;
      let payload;
      try { payload = JSON.parse(rows[0].message); } catch {
        await connection.query("UPDATE notifications SET type='mail.failed' WHERE id=?", [rows[0].id]);
        return null;
      }
      payload.attempts = Number(payload.attempts || 0) + 1;
      payload.claimToken = randomUUID();
      const claim = JSON.stringify(payload);
      await connection.query("UPDATE notifications SET type='mail.sending',message=?,created_at=CURRENT_TIMESTAMP WHERE id=?", [claim, rows[0].id]);
      return { id: rows[0].id, payload, claim };
    });
  },

  /** Hoàn tất đúng lease; lỗi tạm được retry tối đa 3 lần với khoảng lùi hữu hạn. */
  async finishMail(job, code = null) {
    const retry = code && job.payload.attempts < 3;
    const type = code ? retry ? 'mail.pending' : 'mail.failed' : 'mail.sent';
    const payload = { ...job.payload, errorCode: code || null };
    const delay = retry ? job.payload.attempts * 60 : 0;
    await pool.query("UPDATE notifications SET type=?,message=?,created_at=DATE_ADD(CURRENT_TIMESTAMP,INTERVAL ? SECOND) WHERE id=? AND type='mail.sending' AND message=?", [type, JSON.stringify(payload), delay, job.id, job.claim]);
  },

  /** Thống kê trạng thái gửi cho vận hành; không xuất nội dung email hay thông tin SMTP. */
  async mailStats() {
    const [rows] = await pool.query("SELECT type,COUNT(*) AS total FROM notifications WHERE type LIKE 'mail.%' GROUP BY type");
    return Object.fromEntries(rows.map(row => [row.type.slice(5), Number(row.total)]));
  }
};

module.exports = Notification;
