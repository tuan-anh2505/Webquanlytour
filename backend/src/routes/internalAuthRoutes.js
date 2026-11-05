const router = require('express').Router();
const controller = require('../controllers/authController');
const { authenticateOperations } = require('../middlewares/auth');

// Root gắn thêm giới hạn IP/rate limit cho cổng này; không có route tự đăng ký tài khoản vận hành.
router.post('/login', controller.loginOperations);
router.get('/me', authenticateOperations, controller.me);
router.patch('/me', authenticateOperations, controller.updateMe);

module.exports = router;
