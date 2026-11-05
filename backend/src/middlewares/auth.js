const jwt = require('jsonwebtoken');
const User = require('../models/UserModel');

// Token được ràng buộc với đúng ứng dụng, không dùng token của dịch vụ khác.
const JWT_OPTIONS = { algorithms: ['HS256'], issuer: 'webquanlytour', audience: 'webquanlytour-web' };

/** Xác thực Bearer JWT và tải lại tài khoản để lệnh khóa/thu hồi quyền có hiệu lực ngay. */
async function authenticate(req, res, next) {
    const authorization = req.headers.authorization;
    if (typeof authorization !== 'string' || !/^Bearer\s+\S+$/i.test(authorization)) {
        return next(Object.assign(new Error('Vui lòng đăng nhập để tiếp tục.'), { status: 401 }));
    }
    let payload;
    try {
        payload = jwt.verify(authorization.replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET, JWT_OPTIONS);
        if (!payload || typeof payload.sub !== 'string' || !/^[1-9]\d{0,19}$/.test(payload.sub)) throw new Error('Invalid subject');
    } catch {
        return next(Object.assign(new Error('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'), { status: 401 }));
    }
    try {
        const user = await User.findById(payload.sub);
        if (!user || user.status !== 'active') {
            return next(Object.assign(new Error('Tài khoản không còn hoạt động.'), { status: 401 }));
        }
        user.permissions = user.role === 'staff' ? await User.permissionsFor(user.id) : [];
        req.user = user;
        return next();
    } catch (error) { return next(error); }
}

/** Giới hạn nhóm vai trò được gọi API; dùng sau authenticate. */
function requireRoles(...roles) {
    return function checkRole(req, res, next) {
        if (!req.user) return next(Object.assign(new Error('Vui lòng đăng nhập.'), { status: 401 }));
        if (!roles.includes(req.user.role)) return next(Object.assign(new Error('Bạn không có quyền thực hiện thao tác này.'), { status: 403 }));
        return next();
    };
}

/** Admin được toàn quyền; Staff phải có đúng permission_key được cấp trong database. */
function requirePermission(permission) {
    return function checkPermission(req, res, next) {
        if (!req.user) return next(Object.assign(new Error('Vui lòng đăng nhập.'), { status: 401 }));
        if (req.user.role === 'admin' || (req.user.role === 'staff' && req.user.permissions.includes(permission))) return next();
        return next(Object.assign(new Error('Bạn chưa được cấp quyền thực hiện thao tác này.'), { status: 403 }));
    };
}

module.exports = { authenticate, requireRoles, requirePermission, JWT_OPTIONS };
