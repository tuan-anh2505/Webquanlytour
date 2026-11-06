import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { statusLabels } from '../services/format';
import { OPERATIONS_LOGIN_PATH } from '../services/portalConfig';

/** Menu Giai đoạn 3 tuân theo đúng khóa quyền do backend cung cấp. */
function ExtendedNavigation({ can }) {
  return <>{can('trips.read') && <NavLink to="/admin/trips">Điều hành chuyến đi</NavLink>}{can('guides.read') && <NavLink to="/admin/guides">Hướng dẫn viên</NavLink>}{can('articles.read') && <NavLink to="/admin/articles">Bài viết & tin tức</NavLink>}{can('reviews.read') && <NavLink to="/admin/reviews">Kiểm duyệt đánh giá</NavLink>}<NavLink to="/admin/notifications">Thông báo của tôi</NavLink></>;
}

/** Menu quản trị chỉ hiển thị module mà tài khoản được cấp quyền đọc. */
export function AdminLayout() {
  const { operationsUser: user, can, logoutOperations } = useAuth();
  const navigate = useNavigate();
  /** Kết thúc riêng phiên vận hành, giữ nguyên phiên Customer nếu đang mở cùng tab. */
  function signOut() { logoutOperations(); navigate(OPERATIONS_LOGIN_PATH, { replace: true }); }
  return <div className="operations-shell"><header className="operations-topbar"><Link to="/admin" className="operations-brand">✦ Quản lý tour</Link><div><span>{user.full_name}</span><button className="text-button" onClick={signOut}>Đăng xuất</button></div></header><div className="container admin-shell"><aside className="admin-sidebar"><div className="eyebrow">KHÔNG GIAN LÀM VIỆC</div><h2>Quản lý du lịch</h2><p className="muted">{statusLabels[user.role]}</p><nav aria-label="Quản trị"><NavLink to="/admin" end>Tổng quan</NavLink>{can('bookings.read') && <NavLink to="/admin/bookings">Booking & hành khách</NavLink>}{can('payments.read') && <NavLink to="/admin/payments">Thanh toán</NavLink>}{can('tours.read') && <NavLink to="/admin/tours">Quản lý tour</NavLink>}{can('categories.read') && <NavLink to="/admin/categories">Danh mục</NavLink>}{user.role === 'admin' && <NavLink to="/admin/users">Người dùng & quyền</NavLink>}<ExtendedNavigation can={can} /></nav><p className="sidebar-note">Mọi thao tác được kiểm tra quyền tại máy chủ.</p><Link className="text-button" to="/">Xem website công khai ↗</Link></aside><main className="admin-content" id="main"><Outlet /></main></div></div>;
}
