import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { statusLabels } from '../services/format';

/** Menu quản trị chỉ hiển thị module mà tài khoản được cấp quyền đọc. */
export function AdminLayout() {
  const { user, can } = useAuth();
  return <div className="container admin-shell"><aside className="admin-sidebar"><div className="eyebrow">KHÔNG GIAN LÀM VIỆC</div><h2>Quản lý du lịch</h2><p className="muted">{statusLabels[user.role]}</p><nav aria-label="Quản trị"><NavLink to="/admin" end>Tổng quan</NavLink>{can('tours.read') && <NavLink to="/admin/tours">Quản lý tour</NavLink>}{can('categories.read') && <NavLink to="/admin/categories">Danh mục</NavLink>}{user.role === 'admin' && <NavLink to="/admin/users">Người dùng & quyền</NavLink>}</nav><p className="sidebar-note">Mọi thao tác được kiểm tra quyền tại máy chủ.</p></aside><section className="admin-content"><Outlet /></section></div>;
}
