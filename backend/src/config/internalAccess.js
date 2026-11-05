const { BlockList, isIP } = require('node:net');

/** Đường dẫn cấu hình được, không được xem như mật khẩu hoặc cơ chế phân quyền. */
function getInternalAuthPath() {
  return process.env.INTERNAL_AUTH_PATH || '/api/operations/auth';
}

/** Phân tích IP/CIDR nội bộ; không tin header X-Forwarded-For khi chưa cấu hình proxy. */
function buildInternalAllowList(value = process.env.INTERNAL_ALLOWED_IPS || '127.0.0.1,::1') {
  const entries = String(value).split(',').map(item => item.trim()).filter(Boolean);
  if (!entries.length) throw new Error('INTERNAL_ALLOWED_IPS cần ít nhất một IP hoặc dải CIDR.');
  const list = new BlockList();
  for (const entry of entries) {
    const parts = entry.split('/');
    const version = isIP(parts[0]);
    if (!version || parts.length > 2) throw new Error('INTERNAL_ALLOWED_IPS chứa IP/CIDR không hợp lệ.');
    const type = version === 4 ? 'ipv4' : 'ipv6';
    if (parts.length === 1) list.addAddress(parts[0], type);
    else {
      if (!/^\d+$/.test(parts[1])) throw new Error('Tiền tố CIDR nội bộ không hợp lệ.');
      const prefix = Number(parts[1]);
      if (prefix < 0 || prefix > (version === 4 ? 32 : 128)) throw new Error('Tiền tố CIDR nội bộ không hợp lệ.');
      list.addSubnet(parts[0], prefix, type);
    }
  }
  return list;
}

module.exports = { getInternalAuthPath, buildInternalAllowList };
