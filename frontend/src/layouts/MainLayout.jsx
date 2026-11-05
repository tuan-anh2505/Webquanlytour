import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useResource } from '../hooks/useResource';

/** Khung chung cho khách và quản trị; danh mục tour luôn truy cập công khai. */
export function MainLayout() {
  const { user, logout } = useAuth();
  const company = useResource('/company');
  const navigate = useNavigate();
  const name = company.data?.company_name || 'Hành Trình';
  function signOut() { logout(); navigate('/'); }
  return <>
    <a className="skip-link" href="#main">Chuyển tới nội dung</a>
    <header className="site-header"><div className="container header-inner">
      <Link className="brand" to="/" aria-label={`${name} - Trang chủ`}><span className="brand-mark" aria-hidden="true">✦</span><span>{name}<small>KHÁM PHÁ THEO CÁCH CỦA BẠN</small></span></Link>
      <nav className="main-nav" aria-label="Điều hướng chính"><NavLink to="/" end>Khám phá tour</NavLink>{user && <NavLink to="/account">Tài khoản</NavLink>}{['admin', 'staff'].includes(user?.role) && <NavLink to="/admin">Quản trị</NavLink>}</nav>
      <div className="header-actions">{user ? <><span className="user-name">{user.full_name}</span><button className="text-button" onClick={signOut}>Đăng xuất</button></> : <><Link className="text-button" to="/login">Đăng nhập</Link><Link className="button small" to="/register">Đăng ký</Link></>}</div>
    </div></header>
    <main id="main"><Outlet /></main>
    <footer className="site-footer"><div className="container footer-grid"><div><Link className="brand light" to="/"><span className="brand-mark">✦</span>{name}</Link><p>{company.data?.introduction || 'Mỗi hành trình là một câu chuyện đáng nhớ.'}</p></div><div><strong>Kết nối cùng chúng tôi</strong>{company.data?.hotline && <p>Hotline: {company.data.hotline}</p>}{company.data?.email && <p>{company.data.email}</p>}{company.data?.address && <p>{company.data.address}</p>}<p className="muted">© {new Date().getFullYear()} {name}</p></div></div></footer>
  </>;
}
