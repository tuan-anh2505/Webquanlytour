import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/** Chỉ yêu cầu phiên đăng nhập tại trang tài khoản và khi bắt đầu đặt tour. */
export function ProtectedRoute({ manage = false, permission }) {
  const { user, loading, can } = useAuth();
  const location = useLocation();
  if (loading) return <div className="state" role="status">Đang kiểm tra phiên đăng nhập…</div>;
  if (!user) return <Navigate replace to={'/login?next=' + encodeURIComponent(location.pathname + location.search)} />;
  if ((manage && !['admin', 'staff'].includes(user.role)) || (permission && !can(permission))) return <div className="state"><h1>Không có quyền truy cập</h1><p>Vui lòng liên hệ quản trị viên nếu bạn cần quyền thực hiện chức năng này.</p></div>;
  return <Outlet />;
}
