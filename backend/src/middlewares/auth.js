const jwt = require('jsonwebtoken');
const User = require('../models/UserModel');
const { getPortalConfig } = require('../config/authPortal');

// Export để các kiểm thử/adapter Customer tiếp tục dùng cùng tiêu chuẩn xác minh.
const JWT_OPTIONS = { algorithms: ['HS256'], issuer: 'webquanlytour', audience: 'webquanlytour-web' };

/** Tạo middleware xác thực riêng từng cổng, không tin role do client hoặc token tự khai báo. */
function authenticateForPortal(portal) {
 return async function authenticatePortal(req, res, next) {
    const config = getPortalConfig(portal);
    const authorization = req.headers.authorization;
    if (typeof authorization !== 'string' || !/^Bearer\s+\S+$/i.test(authorization)) {
        return next(Object.assign(new Error('Vui lòng đăng nhập để tiếp tục.'), { status: 401 }));
    }
    let payload;
    try {
        payload = jwt.verify(authorization.replace(/^Bearer\s+/i, ''), config.secret, config.verifyOptions);
        if (!payload || payload.portal !== portal || typeof payload.sub !== 'string' || !/^[1-9]\d{0,19}$/.test(payload.sub) || BigInt(payload.sub) > 18446744073709551615n) throw new Error('Invalid portal or subject');
    } catch {
        return next(Object.assign(new Error('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'), { status: 401 }));
    }
    try {
        const user = await User.findById(payload.sub);
        if (!user || user.status !== 'active' || !config.roles.includes(user.role)) {
            return next(Object.assign(new Error('Tài khoản không còn hoạt động.'), { status: 401 }));
        }
        user.permissions = user.role === 'staff' ? await User.permissionsFor(user.id) : [];
        req.user = user;
        req.auth = { portal, subject: payload.sub };
        return next();
    } catch (error) { return next(error); }
 };
}

/** Customer chỉ dùng token từ cổng công khai, kể cả khi user vừa được đổi vai trò trong DB. */
const authenticate = authenticateForPortal('customer');
/** Admin/Staff bắt buộc dùng phiên từ cổng nội bộ với khóa và audience riêng. */
const authenticateOperations = authenticateForPortal('operations');

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
        if (req.user.role === 'admin' || (req.user.role === 'staff' && (req.user.permissions || []).includes(permission))) return next();
        return next(Object.assign(new Error('Bạn chưa được cấp quyền thực hiện thao tác này.'), { status: 403 }));
    };
}

module.exports = { authenticate, authenticateOperations, requireRoles, requirePermission, JWT_OPTIONS };
