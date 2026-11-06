const pool = require('../config/db');
const Booking = require('./BookingModel');

/** Chỉ cho tên cột cố định vào SQL; giá trị luôn truyền qua placeholder. */
async function write(connection, table, data, recordId = null) {
  const allowed = { articles: ['author_id','title','slug','summary','content','cover_image_url','status','meta_title','meta_description','published_at'] }[table];
  if (!allowed) throw new Error('Unsupported content table');
  const entries = Object.entries(data).filter(([key]) => allowed.includes(key));
  if (recordId) {
    await connection.query(`UPDATE ${table} SET ${entries.map(([key]) => `\`${key}\`=?`).join(',')} WHERE id=?`, [...entries.map(([,value]) => value), recordId]);
    return recordId;
  }
  const [result] = await connection.query(`INSERT INTO ${table} (${entries.map(([key]) => `\`${key}\``).join(',')}) VALUES (${entries.map(() => '?').join(',')})`, entries.map(([,value]) => value));
  return String(result.insertId);
}

/** Đóng gói phân trang nhất quán với API đã có. */
function paged(rows, total, filter) { return { data: rows, meta: { page: filter.page, limit: filter.limit, total: Number(total), totalPages: Math.ceil(Number(total) / filter.limit) } }; }

const Content = {
  /** Guest chỉ đọc bài đã xuất bản; tìm kiếm cả tên, tóm tắt và nội dung. */
  async articles(filter, manage = false) {
    const conditions = manage ? [] : ["a.status='published'", 'a.published_at<=CURRENT_TIMESTAMP'];
    const params = [];
    if (manage && filter.status) { conditions.push('a.status=?'); params.push(filter.status); }
    if (filter.q) { conditions.push('(a.title LIKE ? OR a.summary LIKE ? OR a.content LIKE ?)'); params.push(...Array(3).fill(`%${filter.q}%`)); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [[count], [rows]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total FROM articles a ${where}`, params),
      pool.query(`SELECT a.id,a.title,a.slug,a.summary,a.cover_image_url,a.status,a.meta_title,a.meta_description,a.published_at,a.updated_at,u.full_name AS author_name FROM articles a JOIN users u ON u.id=a.author_id ${where} ORDER BY COALESCE(a.published_at,a.created_at) DESC,a.id DESC LIMIT ? OFFSET ?`, [...params, filter.limit, (filter.page - 1) * filter.limit])
    ]);
    return paged(rows, count[0].total, filter);
  },

  /** Bài nháp/ẩn trả 404 ở API công khai dù biết ID hoặc slug. */
  async article(identifier, manage = false) {
    const column = /^\d+$/.test(String(identifier)) ? 'a.id' : 'a.slug';
    const [rows] = await pool.query(`SELECT a.*,u.full_name AS author_name FROM articles a JOIN users u ON u.id=a.author_id WHERE ${column}=? ${manage ? '' : "AND a.status='published' AND a.published_at<=CURRENT_TIMESTAMP"} LIMIT 1`, [identifier]);
    if (!rows[0]) throw Booking.error(404, 'Không tìm thấy bài viết.');
    return rows[0];
  },

  /** Lưu bài viết có tác giả từ phiên; ngày xuất bản lần đầu lấy từ đồng hồ DB. */
  async saveArticle(recordId, data, authorId) {
    const saved = await Booking.transaction(async connection => {
      let current;
      if (recordId) {
        const [rows] = await connection.query('SELECT * FROM articles WHERE id=? FOR UPDATE', [recordId]);
        if (!rows[0]) throw Booking.error(404, 'Không tìm thấy bài viết.');
        current = rows[0];
      }
      const clean = { ...data };
      if (!recordId) clean.author_id = authorId;
      if ((data.status || current?.status || 'draft') === 'published' && !current?.published_at) {
        const [[clock]] = await connection.query('SELECT CURRENT_TIMESTAMP AS now'); clean.published_at = clock.now;
      }
      return write(connection, 'articles', clean, recordId);
    });
    return this.article(saved, true);
  },

  /** Công khai điểm trung bình chỉ dựa trên các đánh giá đã duyệt và user hoạt động. */
  async reviews(tourId, filter) {
    const [parents] = await pool.query("SELECT id FROM tours WHERE id=? AND status='active'", [tourId]);
    if (!parents[0]) throw Booking.error(404, 'Không tìm thấy tour.');
    const where = "FROM reviews r JOIN users u ON u.id=r.customer_id WHERE r.tour_id=? AND r.status='published' AND u.status='active'";
    const [[summary], [rows]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total,COALESCE(AVG(r.rating),0) AS average ${where}`, [tourId]),
      pool.query(`SELECT r.id,r.rating,r.comment,r.created_at,u.full_name AS customer_name ${where} ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?`, [tourId, filter.limit, (filter.page - 1) * filter.limit])
    ]);
    return { ...paged(rows, summary[0].total, filter), summary: { total: Number(summary[0].total), average: Number(summary[0].average) } };
  },

  /** Chỉ khách có booking hoàn thành của tour mới được viết đánh giá. */
  async reviewEligibility(tourId, customerId, connection = pool) {
    const [[eligible], [existing]] = await Promise.all([
      connection.query("SELECT b.id FROM bookings b JOIN tour_schedules s ON s.id=b.schedule_id JOIN tours t ON t.id=s.tour_id WHERE b.customer_id=? AND s.tour_id=? AND b.status='completed' AND COALESCE(s.return_date,DATE_ADD(DATE(s.departure_date),INTERVAL t.duration_days DAY))<=CURRENT_TIMESTAMP LIMIT 1", [customerId, tourId]),
      connection.query('SELECT id,rating,comment,status,created_at FROM reviews WHERE customer_id=? AND tour_id=?', [customerId, tourId])
    ]);
    return { eligible: eligible.length > 0, review: existing[0] || null };
  },

  /** Tạo/sửa một đánh giá của chính chủ, mọi lần sửa đều đưa về chờ duyệt. */
  async saveReview(tourId, customerId, data) {
    return Booking.transaction(async connection => {
      const [tour] = await connection.query("SELECT id FROM tours WHERE id=? AND status='active' FOR UPDATE", [tourId]);
      if (!tour[0]) throw Booking.error(404, 'Không tìm thấy tour.');
      if (!(await this.reviewEligibility(tourId, customerId, connection)).eligible) throw Booking.error(403, 'Chỉ khách đã hoàn thành tour mới có thể đánh giá.');
      await connection.query("INSERT INTO reviews (customer_id,tour_id,rating,comment,status) VALUES (?,?,?,?,'pending') ON DUPLICATE KEY UPDATE rating=VALUES(rating),comment=VALUES(comment),status='pending'", [customerId, tourId, data.rating, data.comment]);
      return (await this.reviewEligibility(tourId, customerId, connection)).review;
    });
  },

  /** Danh sách kiểm duyệt có ngữ cảnh tour; không trả email, mật khẩu hoặc giấy tờ. */
  async manageReviews(filter) {
    const params = [], conditions = [];
    if (filter.status) { conditions.push('r.status=?'); params.push(filter.status); }
    if (filter.q) { conditions.push('(t.title LIKE ? OR u.full_name LIKE ? OR r.comment LIKE ?)'); params.push(...Array(3).fill(`%${filter.q}%`)); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const join = 'FROM reviews r JOIN tours t ON t.id=r.tour_id JOIN users u ON u.id=r.customer_id';
    const [count] = await pool.query(`SELECT COUNT(*) AS total ${join} ${where}`, params);
    const [rows] = await pool.query(`SELECT r.*,t.title AS tour_title,u.full_name AS customer_name ${join} ${where} ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?`, [...params, filter.limit, (filter.page - 1) * filter.limit]);
    return paged(rows, count[0].total, filter);
  },

  /** Người viết được xem cả đánh giá đang chờ duyệt/ẩn của chính mình. */
  async customerReviews(customerId, filter) {
    const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM reviews WHERE customer_id=?', [customerId]);
    const [rows] = await pool.query('SELECT r.*,t.title AS tour_title,t.slug AS tour_slug FROM reviews r JOIN tours t ON t.id=r.tour_id WHERE r.customer_id=? ORDER BY r.id DESC LIMIT ? OFFSET ?', [customerId, filter.limit, (filter.page - 1) * filter.limit]);
    return paged(rows, count.total, filter);
  },

  /** Kiểm duyệt trạng thái theo quyền reviews.write và gửi thông báo cho người viết. */
  async moderateReview(reviewId, status) {
    return Booking.transaction(async connection => {
      const [rows] = await connection.query('SELECT * FROM reviews WHERE id=? FOR UPDATE', [reviewId]);
      if (!rows[0]) throw Booking.error(404, 'Không tìm thấy đánh giá.');
      await connection.query('UPDATE reviews SET status=? WHERE id=?', [status, reviewId]);
      if (rows[0].status !== status) await require('./NotificationModel').enqueue(connection, rows[0].customer_id, {
        type: 'review.moderated', title: 'Cập nhật đánh giá của bạn', message: status === 'published' ? 'Đánh giá của bạn đã được xuất bản.' : 'Trạng thái đánh giá của bạn vừa được cập nhật.', link: '/account/reviews'
      });
      return { ...rows[0], status };
    });
  },

  /** Yêu thích chỉ gồm tour đang công khai; quan hệ khách/tour dùng khóa chính ghép sẵn có. */
  async wishlist(customerId, filter) {
    const [count] = await pool.query("SELECT COUNT(*) AS total FROM wishlists w JOIN tours t ON t.id=w.tour_id WHERE w.customer_id=? AND t.status='active'", [customerId]);
    const [rows] = await pool.query(`SELECT t.id,t.title,t.slug,t.summary,t.destination,t.base_price,t.duration_days,t.duration_nights,w.created_at,
      (SELECT image_url FROM tour_images i WHERE i.tour_id=t.id ORDER BY i.is_featured DESC,i.sort_order,i.id LIMIT 1) AS featured_image_url
      FROM wishlists w JOIN tours t ON t.id=w.tour_id WHERE w.customer_id=? AND t.status='active' ORDER BY w.created_at DESC,t.id DESC LIMIT ? OFFSET ?`, [customerId, filter.limit, (filter.page - 1) * filter.limit]);
    return paged(rows, count[0].total, filter);
  },

  /** Thêm idempotent hoặc bỏ một yêu thích theo hành động tường minh của chính chủ. */
  async setWishlist(tourId, customerId, enabled) {
    if (enabled) {
      const [rows] = await pool.query("SELECT id FROM tours WHERE id=? AND status='active'", [tourId]);
      if (!rows[0]) throw Booking.error(404, 'Không tìm thấy tour.');
      await pool.query('INSERT IGNORE INTO wishlists (customer_id,tour_id) VALUES (?,?)', [customerId, tourId]);
    } else await pool.query('DELETE FROM wishlists WHERE customer_id=? AND tour_id=?', [customerId, tourId]);
    return { tour_id: String(tourId), saved: enabled };
  },

  /** Trạng thái yêu thích của một tour để UI không cần tải toàn bộ danh sách. */
  async wishlistState(tourId, customerId) {
    const [rows] = await pool.query('SELECT tour_id FROM wishlists WHERE customer_id=? AND tour_id=?', [customerId, tourId]);
    return { saved: rows.length > 0, tour_id: String(tourId) };
  }
};

module.exports = Content;
