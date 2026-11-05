import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, saveToken } from '../services/api';

const AuthContext = createContext(null);

/** Giữ người dùng hiện tại; backend vẫn kiểm tra lại trạng thái/quyền ở mỗi yêu cầu. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  function logout() { saveToken(null); setUser(null); }
  useEffect(() => {
    let current = true;
    const expired = () => { saveToken(null); setUser(null); };
    window.addEventListener('auth:expired', expired);
    if (getToken()) api.get('/auth/me').then(result => { if (current) setUser(result.data); }).catch(() => {}).finally(() => { if (current) setLoading(false); });
    else setLoading(false);
    return () => { current = false; window.removeEventListener('auth:expired', expired); };
  }, []);

  /** Lưu phiên sau đăng ký/đăng nhập thành công; không nhận role từ giao diện khách. */
  async function authenticate(action, credentials) {
    const result = await api.post(`/auth/${action}`, credentials);
    saveToken(result.data.token);
    setUser(result.data.user);
    return result.data.user;
  }
  /** Chỉ dùng để hiển thị UI; không thay thế kiểm tra quyền của API. */
  function can(permission) { return user?.role === 'admin' || (user?.role === 'staff' && user.permissions?.includes(permission)); }
  return <AuthContext.Provider value={{ user, loading, authenticate, logout, can, setUser }}>{children}</AuthContext.Provider>;
}

/** Truy cập phiên đăng nhập từ các trang và bộ bảo vệ route. */
export const useAuth = () => useContext(AuthContext);
