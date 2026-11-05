const router = require('express').Router();
const controller = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');

// Các route công khai chỉ dùng khi khách chủ động đăng ký/đăng nhập.
router.post('/register', controller.register);
router.post('/login', controller.login);
// Hồ sơ luôn dựa trên JWT hiện tại, không nhận user_id từ client.
router.get('/me', authenticate, controller.me);
router.patch('/me', authenticate, controller.updateMe);

module.exports = router;
