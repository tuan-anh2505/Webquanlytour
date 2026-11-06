import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Trang tài khoản/vận hành không được index; robot directives không thay thế JWT/IP guard. */
export function PagePrivacy() {
  const { pathname } = useLocation();
  useEffect(() => {
    const publicPage = pathname === '/' || /^\/(tours|articles)(\/[^/]+)?$/.test(pathname);
    let robots = document.head.querySelector('meta[name="robots"]');
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
    robots.content = publicPage ? 'index,follow' : 'noindex,nofollow';
    if (!publicPage) document.title = pathname.startsWith('/admin') ? 'Vận hành | Hành Trình' : 'Tài khoản | Hành Trình';
  }, [pathname]);
  return null;
}
