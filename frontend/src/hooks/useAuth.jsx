import { createContext, useContext, useEffect, useState } from 'react';
import { customerApi, operationsApi, getToken, saveToken, clearLegacySession } from '../services/api';

const AuthContext = createContext(null);

/** Giữ hai phiên độc lập; quyền và phạm vi token vẫn được backend kiểm tra mỗi yêu cầu. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [operationsUser, setOperationsUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [operationsLoading, setOperationsLoading] = useState(true);
  function logout() { saveToken(null); setUser(null); }
  function logoutOperations() { saveToken(null, 'operations'); setOperationsUser(null); }
  useEffect(() => {
    let current = true;
    clearLegacySession();
    const expired = () => { saveToken(null); setUser(null); };
    const operationsExpired = () => { saveToken(null, 'operations'); setOperationsUser(null); };
    window.addEventListener('auth:expired:customer', expired);
    window.addEventListener('auth:expired:operations', operationsExpired);
    if (getToken()) customerApi.get('/auth/me').then(result => { if (current && result.data?.role === 'customer') setUser(result.data); }).catch(() => {}).finally(() => { if (current) setLoading(false); });
    else setLoading(false);
    if (getToken('operations')) operationsApi.get('/auth/me').then(result => { if (current && ['admin', 'staff'].includes(result.data?.role)) setOperationsUser(result.data); }).catch(() => {}).finally(() => { if (current) setOperationsLoading(false); });
    else setOperationsLoading(false);
    return () => {
      current = false;
      window.removeEventListener('auth:expired:customer', expired);
      window.removeEventListener('auth:expired:operations', operationsExpired);
    };
  }, []);

  /** Lưu phiên sau đăng ký/đăng nhập thành công; không nhận role từ giao diện khách. */
  async function authenticate(action, credentials) {
    const result = await customerApi.post(`/auth/${action}`, credentials);
    if (result.data.user.role !== 'customer') throw new Error('Không thể đăng nhập bằng thông tin này.');
    saveToken(result.data.token);
    setUser(result.data.user);
    return result.data.user;
  }
  /** Cấp riêng phiên vận hành từ cổng nội bộ, không ghi đè phiên Customer. */
  async function authenticateOperations(credentials) {
    const result = await operationsApi.post('/auth/login', credentials);
    if (!['admin', 'staff'].includes(result.data.user.role)) throw new Error('Không thể đăng nhập bằng thông tin này.');
    saveToken(result.data.token, 'operations');
    setOperationsUser(result.data.user);
    return result.data.user;
  }
  /** Chỉ dùng để hiển thị UI; không thay thế kiểm tra quyền của API. */
  function can(permission) { return operationsUser?.role === 'admin' || (operationsUser?.role === 'staff' && operationsUser.permissions?.includes(permission)); }
  return <AuthContext.Provider value={{ user, loading, authenticate, logout, setUser, operationsUser, operationsLoading, authenticateOperations, logoutOperations, can, setOperationsUser }}>{children}</AuthContext.Provider>;
}

/** Truy cập phiên đăng nhập từ các trang và bộ bảo vệ route. */
export const useAuth = () => useContext(AuthContext);
