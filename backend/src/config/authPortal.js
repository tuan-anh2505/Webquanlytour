const { hkdfSync } = require('node:crypto');

const ISSUER = 'webquanlytour';
const PORTALS = Object.freeze({
    customer: { audience: 'webquanlytour-web', roles: ['customer'] },
    operations: { audience: 'webquanlytour-operations', roles: ['admin', 'staff'] }
});

/**
 * Lấy cấu hình JWT riêng cho từng cổng. Đường dẫn nội bộ không phải bí mật bảo mật;
 * chữ ký, audience, portal và vai trò hiện tại cùng quyết định quyền sử dụng token.
 */
function getPortalConfig(portal = 'customer') {
    const descriptor = PORTALS[portal];
    if (!descriptor) throw new Error('Cổng xác thực không được hỗ trợ.');
    let secret = process.env.JWT_SECRET;
    if (portal === 'operations') {
        if (process.env.NODE_ENV === 'production' && !process.env.INTERNAL_JWT_SECRET) {
            throw new Error('Môi trường production cần INTERNAL_JWT_SECRET riêng cho cổng vận hành.');
        }
        // Chỉ là cấu hình local thuận tiện; môi trường production phải có khóa nội bộ riêng.
        secret = process.env.INTERNAL_JWT_SECRET || Buffer.from(hkdfSync(
            'sha256', process.env.JWT_SECRET || '', 'webquanlytour-auth-v1', 'operations-jwt-v1', 32
        ));
    }
    return {
        portal,
        roles: descriptor.roles,
        secret,
        issuer: ISSUER,
        audience: descriptor.audience,
        expiresIn: portal === 'operations' ? process.env.INTERNAL_JWT_EXPIRES_IN || '2h' : process.env.JWT_EXPIRES_IN || '8h',
        verifyOptions: { algorithms: ['HS256'], issuer: ISSUER, audience: descriptor.audience }
    };
}

module.exports = { getPortalConfig };
