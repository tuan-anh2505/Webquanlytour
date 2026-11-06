const Content = require('../models/ContentModel');
const Operations = require('../models/OperationsModel');
const Notification = require('../models/NotificationModel');
const Tour = require('../models/TourModel');
const validate = require('../validators/siteValidator');

/** Chỉ chấp nhận ID hoặc slug an toàn trước khi truy vấn bài viết. */
function articleIdentifier(value) {
  if (/^\d+$/.test(value)) return validate.id(value);
  return require('../validators/tourValidator').slug(value, 255);
}

module.exports = {
  /** Dashboard trả riêng các nhóm số liệu mà tài khoản được phép đọc. */
  async dashboard(req, res) { res.json({ data: await Operations.dashboard(req.user, validate.dateRange(req.query)) }); },
  /** Tìm kiếm tổng hợp công khai, không trộn nội dung nháp hoặc ẩn. */
  async search(req, res) {
    const q = validate.common.text(req.query.q || '', 'q', { max: 200, required: false }) || '';
    const [tours, articles] = await Promise.all([Tour.list({ page: 1, limit: 6, q }), Content.articles({ page: 1, limit: 6, q })]);
    res.json({ data: { tours: tours.data, articles: articles.data } });
  },
  /** Guest đọc danh sách bài đã xuất bản. */
  async articles(req, res) { res.json(await Content.articles(validate.list(req.query))); },
  /** Guest đọc bài công khai bằng ID/slug. */
  async article(req, res) { res.json({ data: await Content.article(articleIdentifier(req.params.id)) }); },
  /** Nhân viên quản lý bài nháp/xuất bản/ẩn theo quyền articles.read. */
  async manageArticles(req, res) { res.json(await Content.articles(validate.list(req.query, ['draft','published','hidden']), true)); },
  /** Nội dung đầy đủ của bài quản trị. */
  async manageArticle(req, res) { res.json({ data: await Content.article(validate.id(req.params.id), true) }); },
  /** Tạo bài, gắn tác giả hiện tại và để DB quyết định ngày xuất bản. */
  async createArticle(req, res) { res.status(201).json({ data: await Content.saveArticle(null, validate.article(req.body), req.user.id) }); },
  /** Sửa nội dung/trạng thái bài, không tự đổi tác giả. */
  async updateArticle(req, res) { res.json({ data: await Content.saveArticle(validate.id(req.params.id), validate.article(req.body, true), req.user.id) }); },
  /** Danh sách hồ sơ hướng dẫn viên chỉ dành cho vận hành. */
  async guides(req, res) { res.json(await Operations.guides(validate.list(req.query, ['active','inactive']))); },
  /** Thêm hồ sơ độc lập với user đăng nhập. */
  async createGuide(req, res) { res.status(201).json({ data: await Operations.saveGuide(null, validate.guide(req.body)) }); },
  /** Ngưng hoạt động không xóa hồ sơ, giữ lịch sử phân công. */
  async updateGuide(req, res) { res.json({ data: await Operations.saveGuide(validate.id(req.params.id), validate.guide(req.body, true)) }); },
  /** Danh sách lịch cho điều hành. */
  async trips(req, res) { res.json(await Operations.trips(validate.list(req.query, ['open','closed','cancelled']))); },
  /** Chi tiết có manifest chỉ khi được cấp bookings.read. */
  async trip(req, res) { res.json({ data: await Operations.trip(validate.id(req.params.id), req.user.role === 'admin' || req.user.permissions.includes('bookings.read')) }); },
  /** Cập nhật điểm/giờ tập trung, vận chuyển, khách sạn, hướng dẫn và liên hệ khẩn cấp. */
  async updateTrip(req, res) { res.json({ data: await Operations.updateTrip(validate.id(req.params.id), validate.trip(req.body)) }); },
  /** Phân công một guide với kiểm tra xung đột lịch và guide trưởng. */
  async assignGuide(req, res) {
    validate.common.objectBody(req.body); validate.common.allowFields(req.body, ['guide_id', 'is_lead']);
    if (req.body.is_lead !== undefined && typeof req.body.is_lead !== 'boolean') throw validate.common.validationError('is_lead phải là boolean.');
    res.json({ data: await Operations.assignGuide(validate.id(req.params.id), validate.id(req.body.guide_id), req.body.is_lead === true) });
  },
  /** Gỡ phân công chỉ theo thao tác rõ ràng của người có quyền; không xóa guide. */
  async removeGuide(req, res) { res.json({ data: await Operations.assignGuide(validate.id(req.params.id), validate.id(req.params.guideId), false, true) }); },
  /** Hoàn thành chuyến đã kết thúc để khách có thể đánh giá. */
  async completeTrip(req, res) { validate.common.allowFields(validate.common.objectBody(req.body || {}), []); res.json({ data: await Operations.completeTrip(validate.id(req.params.id), req.user.id) }); },
  /** Khách chỉ xem thông tin chuyến của booking đã xác nhận/hoàn thành chính mình. */
  async customerTrip(req, res) { res.json({ data: await Operations.customerTrip(validate.id(req.params.id), req.user.id) }); },
  /** Điểm trung bình và đánh giá đã duyệt của tour công khai. */
  async reviews(req, res) { res.json(await Content.reviews(validate.id(req.params.id), validate.list(req.query))); },
  /** Xem điều kiện viết và bản đánh giá riêng, kể cả đang chờ duyệt. */
  async eligibility(req, res) { res.json({ data: await Content.reviewEligibility(validate.id(req.params.id), req.user.id) }); },
  /** Khách gửi/sửa review, không được tự xuất bản. */
  async saveReview(req, res) { res.json({ data: await Content.saveReview(validate.id(req.params.id), req.user.id, validate.review(req.body)) }); },
  /** Danh sách review của chính chủ. */
  async ownReviews(req, res) { res.json(await Content.customerReviews(req.user.id, validate.list(req.query))); },
  /** Hàng đợi kiểm duyệt review. */
  async manageReviews(req, res) { res.json(await Content.manageReviews(validate.list(req.query, ['pending','published','hidden']))); },
  /** Chỉ staff có reviews.write/Admin được thay đổi trạng thái. */
  async moderateReview(req, res) {
    validate.common.allowFields(validate.common.objectBody(req.body), ['status']);
    if (!['pending','published','hidden'].includes(req.body.status)) throw validate.common.validationError('Trạng thái đánh giá không hợp lệ.');
    res.json({ data: await Content.moderateReview(validate.id(req.params.id), req.body.status) });
  },
  /** Tour yêu thích chỉ thuộc khách đang đăng nhập. */
  async wishlist(req, res) { res.json(await Content.wishlist(req.user.id, validate.list(req.query))); },
  /** Trạng thái nút yêu thích trên chi tiết tour. */
  async wishlistState(req, res) { res.json({ data: await Content.wishlistState(validate.id(req.params.id), req.user.id) }); },
  /** Lưu yêu thích idempotent. */
  async saveWishlist(req, res) { validate.common.allowFields(validate.common.objectBody(req.body || {}), []); res.json({ data: await Content.setWishlist(validate.id(req.params.id), req.user.id, true) }); },
  /** Xóa đúng quan hệ yêu thích của chính chủ theo hành động người dùng. */
  async removeWishlist(req, res) { res.json({ data: await Content.setWishlist(validate.id(req.params.id), req.user.id, false) }); },
  /** Thông báo dùng chung cho mỗi tài khoản, luôn loại email outbox. */
  async notifications(req, res) { res.json(await Notification.list(req.user.id, validate.list(req.query))); },
  /** Đọc một thông báo riêng. */
  async readNotification(req, res) { res.json({ data: await Notification.markRead(req.user.id, validate.id(req.params.id)) }); },
  /** Đánh dấu toàn bộ thông báo của chính mình đã đọc. */
  async readAll(req, res) { res.json({ data: await Notification.markRead(req.user.id) }); }
};
