const environment = import.meta.env || {};
const API_URL = (environment.VITE_API_URL || '/api').replace(/\/$/, '');
const INTERNAL_AUTH_URL = (environment.VITE_INTERNAL_AUTH_PATH || `${API_URL}/operations/auth`).replace(/\/$/, '');
const TOKEN_KEYS = { customer: 'webquanlytour.customer.token', operations: 'webquanlytour.operations.token' };

/** Đọc JWT đúng cổng; không dùng token khách thay cho token nhân viên hoặc ngược lại. */
export const getToken = (portal = 'customer') => sessionStorage.getItem(TOKEN_KEYS[portal]);
/** Chỉ cập nhật/xóa phiên thuộc cổng được chỉ định, giữ nguyên phiên còn lại của cùng tab. */
export function saveToken(token, portal = 'customer') {
  if (token) sessionStorage.setItem(TOKEN_KEYS[portal], token);
  else sessionStorage.removeItem(TOKEN_KEYS[portal]);
}

/** Loại bỏ token cũ dùng chung; người dùng cần đăng nhập lại qua đúng cổng mới. */
export function clearLegacySession() { sessionStorage.removeItem('webquanlytour.token'); }

/** Tách URL xác thực nội bộ khỏi API khách; URL chỉ là vị trí truy cập, không phải bí mật bảo mật. */
function endpoint(path, portal) {
  return portal === 'operations' && /^\/auth(?:\/|$)/.test(path)
    ? INTERNAL_AUTH_URL + path.slice('/auth'.length)
    : API_URL + path;
}

/** Gửi JSON với token đúng phạm vi và báo lỗi phiên riêng, không ghi JWT vào log. */
async function request(path, { method = 'GET', body, signal, headers = {} } = {}, portal = 'customer') {
  const token = getToken(portal);
  // Chỉ nhận header nghiệp vụ đã biết; caller không thể ghi đè Authorization để trộn hai phiên.
  const idempotencyKey = Object.entries(headers).find(([key]) => key.toLowerCase() === 'idempotency-key')?.[1];
  const response = await fetch(endpoint(path, portal), {
    method, signal,
    headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(typeof idempotencyKey === 'string' ? { 'Idempotency-Key': idempotencyKey } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event(`auth:expired:${portal}`));
    const error = new Error(json.message || `Không thể xử lý yêu cầu (${response.status}).`);
    error.status = response.status;
    error.errors = json.errors;
    throw error;
  }
  return json;
}

/** Tạo client cho một cổng cố định, không tự thử lại bằng token của cổng khác. */
function createClient(portal) {
  return {
    get: (path, options) => request(path, options, portal),
    post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body }, portal),
    patch: (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body }, portal),
    put: (path, body, options = {}) => request(path, { ...options, method: 'PUT', body }, portal),
    delete: (path, options = {}) => request(path, { ...options, method: 'DELETE' }, portal),
  };
}

export const customerApi = createClient('customer');
export const operationsApi = createClient('operations');
// Tái sử dụng các trang hiện có: đường dẫn /manage luôn dùng phiên nhân viên, độc lập role trên UI.
export const api = Object.fromEntries(['get', 'post', 'patch', 'put', 'delete'].map((method) => [method,
  (path, ...args) => (/^\/manage(?:\/|\?|$)/.test(path) ? operationsApi : customerApi)[method](path, ...args)
]));
