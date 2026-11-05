const express = require('express');
const controller = require('../controllers/paymentController');
const { authenticate, authenticateOperations, requireRoles, requirePermission } = require('../middlewares/auth');

// Customer chỉ thao tác giao dịch của chính mình; thông tin sở hữu kiểm tra thêm ở service.
const customerRouter = express.Router();
customerRouter.use(authenticate, requireRoles('customer'));
customerRouter.get('/:reference', controller.detail);
customerRouter.post('/:reference/simulate', controller.simulate);

// Gắn tại /api/bookings, dùng chung ID booking hiện hữu và không nhận customer_id từ client.
const bookingPaymentRouter = express.Router();
bookingPaymentRouter.post('/:id/payments', authenticate, requireRoles('customer'), controller.create);

// Chỉ chữ ký HMAC hợp lệ mới được xử lý; webhook không dùng token của khách.
const webhookRouter = express.Router();
webhookRouter.post('/', controller.webhook);

// Gắn tại /api/manage/payments, cộng IP guard chung của toàn bộ vùng quản trị.
const manageRouter = express.Router();
manageRouter.use(authenticateOperations, requireRoles('admin', 'staff'));
manageRouter.get('/', requirePermission('payments.read'), controller.listManage);
manageRouter.get('/:reference', requirePermission('payments.read'), controller.detailManage);
manageRouter.post('/:reference/refund', requirePermission('payments.write'), controller.refund);

module.exports = { customerRouter, bookingPaymentRouter, webhookRouter, manageRouter };
