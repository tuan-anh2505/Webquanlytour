const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const TOKEN_KEY = 'webquanlytour.token';

/** Đọc JWT trong phiên của tab; token không tồn tại sau khi đóng phiên trình duyệt. */
export const getToken = () => sessionStorage.getItem(TOKEN_KEY);
/** Cập nhật hoặc xóa JWT khi đăng nhập/đăng xuất. */
export function saveToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

/** Gửi JSON và thống nhất cách xử lý lỗi từ backend; không ghi token vào log. */
async function request(path, { method = 'GET', body, signal } = {}) {
  const token = getToken();
  const response = await fetch(API_URL + path, {
    method, signal,
    headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event('auth:expired'));
    const error = new Error(json.message || `Không thể xử lý yêu cầu (${response.status}).`);
    error.status = response.status;
    error.errors = json.errors;
    throw error;
  }
  return json;
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
};
