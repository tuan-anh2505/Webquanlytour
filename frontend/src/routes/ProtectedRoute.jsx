import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { OPERATIONS_LOGIN_PATH } from '../services/portalConfig';

/** Chỉ yêu cầu phiên đăng nhập tại trang tài khoản và khi bắt đầu đặt tour. */
export function ProtectedRoute({ manage = false, permission }) {
  const auth = useAuth();
  const operations = manage || Boolean(permission);
  const user = operations ? auth.operationsUser : auth.user;
  const loading = operations ? auth.operationsLoading : auth.loading;
  const { can } = auth;
  const location = useLocation();
  if (loading) return <div className="state" role="status">Đang kiểm tra phiên đăng nhập…</div>;
  if (!user) return <Navigate replace to={(operations ? OPERATIONS_LOGIN_PATH : '/login') + '?next=' + encodeURIComponent(location.pathname + location.search)} />;
  if ((manage && !['admin', 'staff'].includes(user.role)) || (permission && !can(permission))) return <div className="state"><h1>Không có quyền truy cập</h1><p>Vui lòng liên hệ quản trị viên nếu bạn cần quyền thực hiện chức năng này.</p></div>;
  return <Outlet />;
}
