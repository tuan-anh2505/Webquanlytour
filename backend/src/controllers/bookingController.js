const BookingModel = require('../models/BookingModel');
const service = require('../services/bookingService');
const validate = require('../validators/bookingValidator');

module.exports = {
  /** Customer tạo đơn của chính mình; key retry nằm trong header, không nhận customer_id. */
  async create(req, res) {
    const result = await service.createBooking(req.user.id, req.body, req.get('Idempotency-Key'));
    res.status(result.replay ? 200 : 201).json({ data: result.booking, replay: result.replay });
  },
  /** Danh sách chính chủ không chứa giấy tờ hoặc dữ liệu booking của người khác. */
  async listCustomer(req, res) { res.json(await BookingModel.list(validate.list(req.query), { customerId: req.user.id })); },
  /** Chi tiết lấy quyền sở hữu từ JWT; đối tượng không thuộc khách trả cùng lỗi 404. */
  async detailCustomer(req, res) { res.json({ data: await service.getBooking(validate.id(req.params.id, 'Booking'), { customerId: req.user.id }) }); },
  /** Hủy đơn chính chủ trước giờ khởi hành, hoàn chỗ và yêu cầu hoàn tiền nếu cần. */
  async cancelCustomer(req, res) { res.json({ data: await service.cancelBooking(validate.id(req.params.id, 'Booking'), { customerId: req.user.id, reason: validate.cancellation(req.body) }) }); },
  /** Nhân viên xem booking sau khi router kiểm tra bookings.read. */
  async listManage(req, res) { res.json(await BookingModel.list(validate.list(req.query), { operator: true })); },
  /** Chi tiết vận hành bao gồm hành khách, trạng thái và lịch sử theo quyền đọc booking. */
  async detailManage(req, res) { res.json({ data: await service.getBooking(validate.id(req.params.id, 'Booking'), { operator: true }) }); },
  /** Xác nhận thủ công vẫn cần đã thanh toán/không thu phí, không tự gán giá hay trạng thái. */
  async confirmManage(req, res) { res.json({ data: await service.confirmBooking(validate.id(req.params.id, 'Booking'), { actorId: req.user.id, note: validate.confirmation(req.body || {}) }) }); },
  /** Hủy từ vận hành được lưu actor và lý do vào lịch sử. */
  async cancelManage(req, res) { res.json({ data: await service.cancelBooking(validate.id(req.params.id, 'Booking'), { operator: true, actorId: req.user.id, reason: validate.cancellation(req.body) }) }); }
};
