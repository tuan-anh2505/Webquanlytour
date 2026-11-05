const express = require('express');
const controller = require('../controllers/bookingController');
const { authenticate, authenticateOperations, requireRoles, requirePermission } = require('../middlewares/auth');

// Booking chỉ bắt đầu sau đăng nhập Customer, các trang đọc tour vẫn công khai.
const customerRouter = express.Router();
customerRouter.use(authenticate, requireRoles('customer'));
customerRouter.post('/', controller.create);
customerRouter.get('/', controller.listCustomer);
customerRouter.get('/:id', controller.detailCustomer);
customerRouter.post('/:id/cancel', controller.cancelCustomer);

// Phiên nội bộ và quyền cụ thể bắt buộc trên từng route vận hành.
const manageRouter = express.Router();
manageRouter.use(authenticateOperations, requireRoles('admin', 'staff'));
manageRouter.get('/', requirePermission('bookings.read'), controller.listManage);
manageRouter.get('/:id', requirePermission('bookings.read'), controller.detailManage);
manageRouter.post('/:id/confirm', requirePermission('bookings.write'), controller.confirmManage);
manageRouter.post('/:id/cancel', requirePermission('bookings.write'), controller.cancelManage);

module.exports = { customerRouter, manageRouter };
