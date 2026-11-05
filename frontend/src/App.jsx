import { Route, Routes, Link } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { TourListPage } from './pages/public/TourListPage';
import { TourDetailPage } from './pages/public/TourDetailPage';
import { AuthPage } from './pages/public/AuthPage';
import { AccountPage } from './pages/customer/AccountPage';
import { BookingStartPage } from './pages/customer/BookingStartPage';
import { AdminHomePage } from './pages/admin/AdminHomePage';
import { CategoriesPage } from './pages/admin/CategoriesPage';
import { ToursPage } from './pages/admin/ToursPage';
import { TourEditorPage } from './pages/admin/TourEditorPage';
import { UsersPage } from './pages/admin/UsersPage';

/** Các trang đọc tour là public; chỉ bảo vệ tài khoản, đặt tour và khu vực quản trị. */
export default function App() {
  return <Routes><Route element={<MainLayout />}>
    <Route index element={<TourListPage />} />
    <Route path="tours/:slug" element={<TourDetailPage />} />
    <Route path="login" element={<AuthPage />} />
    <Route path="register" element={<AuthPage register />} />
    <Route element={<ProtectedRoute />}><Route path="account" element={<AccountPage />} /><Route path="booking/start" element={<BookingStartPage />} /></Route>
    <Route element={<ProtectedRoute manage />}><Route path="admin" element={<AdminLayout />}>
      <Route index element={<AdminHomePage />} />
      <Route element={<ProtectedRoute permission="tours.read" />}><Route path="tours" element={<ToursPage />} /><Route path="tours/:id" element={<TourEditorPage />} /></Route>
      <Route element={<ProtectedRoute permission="tours.write" />}><Route path="tours/new" element={<TourEditorPage />} /></Route>
      <Route element={<ProtectedRoute permission="categories.read" />}><Route path="categories" element={<CategoriesPage />} /></Route>
      <Route path="users" element={<UsersPage />} />
    </Route></Route>
    <Route path="*" element={<div className="container narrow page-space"><span className="eyebrow">404</span><h1>Chưa tìm thấy trang này</h1><p>Đường dẫn có thể đã thay đổi. Mời bạn tiếp tục khám phá các hành trình.</p><Link className="button" to="/">Về trang chủ</Link></div>} />
  </Route></Routes>;
}
