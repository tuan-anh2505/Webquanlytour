const { isIP } = require('node:net');
const { buildInternalAllowList } = require('../config/internalAccess');

/** Chặn API vận hành ngoài mạng được phép; mọi request hợp lệ vẫn phải qua JWT và quyền. */
function createInternalNetworkGuard(allowList = buildInternalAllowList()) {
  return function internalNetworkGuard(req, res, next) {
    let address = req.ip || req.socket?.remoteAddress || '';
    if (address.startsWith('::ffff:') && isIP(address.slice(7)) === 4) address = address.slice(7);
    const version = isIP(address);
    if (!version || !allowList.check(address, version === 4 ? 'ipv4' : 'ipv6')) {
      return res.status(404).json({ message: 'Không tìm thấy chức năng được yêu cầu.' });
    }
    return next();
  };
}

module.exports = { createInternalNetworkGuard };
