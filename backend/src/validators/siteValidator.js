const common = require('./authValidator');
const tour = require('./tourValidator');

/** Phân trang/tìm kiếm dùng chung cho bài viết, đánh giá, hướng dẫn viên và thông báo. */
function list(query = {}, allowedStatuses = []) {
  const page = Number(query.page ?? 1), limit = Number(query.limit ?? 20);
  if (typeof query.page === 'object' || typeof query.limit === 'object' || !Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw common.validationError('Phân trang không hợp lệ.');
  const q = query.q == null ? '' : common.text(query.q, 'q', { max: 200, required: false }) || '';
  const status = query.status || '';
  if (status && !allowedStatuses.includes(status)) throw common.validationError('Trạng thái không hợp lệ.');
  return { page, limit, q, status };
}

/** Giới hạn khoảng dashboard để báo cáo luôn có số ngày hữu hạn. */
function dateRange(query = {}) {
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const end = query.to || today;
  const start = query.from || new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  for (const value of [start, end]) {
    const date = typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0,4)) < 1000 || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw common.validationError('Khoảng ngày phải có dạng YYYY-MM-DD hợp lệ.');
  }
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (!Number.isFinite(days) || days < 0 || days > 365) throw common.validationError('Khoảng ngày cần từ 1 đến 366 ngày.');
  return { from: start, to: end };
}

/** Bài viết chỉ lưu văn bản; tác giả được lấy từ token, không nhận HTML thực thi. */
function article(body, partial = false) {
  common.objectBody(body);
  common.allowFields(body, ['title', 'slug', 'summary', 'content', 'cover_image_url', 'status', 'meta_title', 'meta_description']);
  const result = {};
  for (const [key, max] of Object.entries({ title: 255, summary: 5000, content: 100000, meta_title: 255, meta_description: 500 })) {
    if (body[key] !== undefined || (!partial && ['title', 'content'].includes(key))) result[key] = common.text(body[key], key, { max, required: ['title', 'content'].includes(key) });
  }
  if (body.slug !== undefined) result.slug = tour.slug(body.slug, 255);
  else if (!partial) result.slug = tour.slug(tour.makeSlug(result.title), 255);
  if (body.cover_image_url !== undefined) result.cover_image_url = body.cover_image_url ? tour.imageUrl(body.cover_image_url) : null;
  if (body.status !== undefined) {
    if (!['draft', 'published', 'hidden'].includes(body.status)) throw common.validationError('Trạng thái bài viết không hợp lệ.');
    result.status = body.status;
  }
  if (!Object.keys(result).length) throw common.validationError('Chưa có dữ liệu cần lưu.');
  return result;
}

/** Hồ sơ hướng dẫn viên không tạo tài khoản đăng nhập hay vai trò mới. */
function guide(body, partial = false) {
  common.objectBody(body);
  common.allowFields(body, ['full_name', 'phone', 'email', 'languages', 'bio', 'status']);
  const result = {};
  for (const [key, max] of Object.entries({ full_name: 150, languages: 255, bio: 15000 })) if (body[key] !== undefined || (!partial && key === 'full_name')) result[key] = common.text(body[key], key, { max, required: key === 'full_name' });
  if (body.phone !== undefined) result.phone = common.phone(body.phone);
  if (body.email !== undefined) result.email = body.email ? common.email(body.email) : null;
  if (body.status !== undefined) {
    if (!['active', 'inactive'].includes(body.status)) throw common.validationError('Trạng thái hướng dẫn viên không hợp lệ.');
    result.status = body.status;
  }
  if (!Object.keys(result).length) throw common.validationError('Chưa có dữ liệu cần lưu.');
  return result;
}

/** Đánh giá chỉ nhận điểm/nội dung, trạng thái kiểm duyệt do nhân viên quyết định. */
function review(body) {
  common.objectBody(body); common.allowFields(body, ['rating', 'comment']);
  if (typeof body.rating !== 'number' || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) throw common.validationError('Điểm đánh giá cần từ 1 đến 5.');
  return { rating: body.rating, comment: common.text(body.comment, 'comment', { max: 5000, required: false }) };
}

/** Cập nhật thông tin chuyến đi không được sửa giá, sức chứa hoặc số chỗ đã đặt. */
function trip(body) {
  common.objectBody(body);
  common.allowFields(body, ['meeting_point', 'meeting_time', 'transport_info', 'accommodation_info', 'emergency_phone', 'customer_instructions', 'notes']);
  return tour.schedule(body, true);
}

module.exports = { list, dateRange, article, guide, review, trip, id: tour.id, common };
