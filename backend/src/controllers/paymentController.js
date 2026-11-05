const service = require('../services/paymentService');
const validate = require('../validators/paymentValidator');
const { userId, objectBody, allowFields } = require('../validators/authValidator');

/** Tạo hoặc lấy lại phiên thanh toán từ giá chốt trong booking, không nhận giá client. */
async function create(req, res) {
    const body = req.body == null ? {} : objectBody(req.body);
    allowFields(body, []);
    res.status(201).json({ data: await service.create(userId(req.params.id), req.user.id) });
}

/** Khách chỉ đọc hóa đơn của chính mình. */
async function detail(req, res) {
    res.json({ data: await service.detail(validate.reference(req.params.reference), { customerId: req.user.id }) });
}

/** Thao tác thử nghiệm được server ký và đi qua cùng bộ xác minh như webhook HTTP. */
async function simulate(req, res) {
    res.json({ data: await service.simulate(validate.reference(req.params.reference), req.user.id, validate.simulation(req.body)) });
}

/** Root phải mount express.raw trước express.json để chữ ký bao phủ chính xác body nhận được. */
async function webhook(req, res) {
    res.json({ data: await service.processWebhook(req.body, req.get('X-Payment-Signature')) });
}

/** Người vận hành chỉ có danh sách khi đã được cấp payments.read. */
async function listManage(req, res) { res.json(await service.list(validate.listQuery(req.query))); }

/** Chi tiết cho người vận hành được router kiểm tra quyền. */
async function detailManage(req, res) {
    res.json({ data: await service.detail(validate.reference(req.params.reference), { operator: true }) });
}

/** Xác nhận mock refund đã được yêu cầu; không nhận hoặc sửa số tiền hoàn từ frontend. */
async function refund(req, res) {
    res.json({ data: await service.approveRefund(validate.reference(req.params.reference), validate.refund(req.body || {})) });
}

module.exports = { create, detail, simulate, webhook, listManage, detailManage, refund };
