const router = require('express').Router();
const controller = require('../controllers/userController');
const { authenticateOperations, requireRoles } = require('../middlewares/auth');

// Quản lý tài khoản và cấp quyền Staff thuộc quyền Admin trên mọi endpoint.
router.use(authenticateOperations, requireRoles('admin'));
router.get('/permissions', controller.permissionDefinitions);
router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.get('/:id/permissions', controller.getPermissions);
router.put('/:id/permissions', controller.setPermissions);

module.exports = router;
