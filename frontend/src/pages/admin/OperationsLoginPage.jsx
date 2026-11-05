import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FormField } from '../../components/FormField';
import { Feedback } from '../../components/Feedback';
import { safeOperationsReturnTo } from '../../services/navigation';

/** Cổng đăng nhập vận hành riêng cho Admin/Staff, không có đăng ký công khai. */
export function OperationsLoginPage() {
  const { operationsUser, operationsLoading, authenticateOperations } = useAuth();
  const [params] = useSearchParams();
  const [state, setState] = useState({});
  const next = safeOperationsReturnTo(params.get('next'));
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Đăng nhập vận hành';
    const robots = document.createElement('meta');
    robots.name = 'robots'; robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => { document.title = previousTitle; robots.remove(); };
  }, []);

  /** Gửi thông tin tới API nội bộ; server quyết định tài khoản có được phép đăng nhập hay không. */
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setState({ saving: true });
    try { await authenticateOperations(values); setState({}); }
    catch (error) { setState({ error: error.message || 'Không thể đăng nhập. Vui lòng thử lại.' }); }
  }
  if (operationsLoading) return <main className="operations-login"><p role="status">Đang kiểm tra phiên vận hành…</p></main>;
  if (operationsUser) return <Navigate to={next} replace />;
  return <main className="operations-login"><section className="operations-login-card"><div className="operations-login-mark" aria-hidden="true">✦</div><h1>Đăng nhập vận hành</h1><p className="muted">Dành cho tài khoản được cấp quyền quản trị hoặc nhân viên.</p><Feedback error={state.error} /><form onSubmit={submit}><FormField label="Email" name="email" type="email" autoComplete="username" maxLength={255} required /><FormField label="Mật khẩu" name="password" type="password" autoComplete="current-password" maxLength={72} required /><button className="button wide" disabled={state.saving}>{state.saving ? 'Đang kiểm tra…' : 'Đăng nhập'}</button></form><p className="operations-login-note">Liên hệ người quản trị nếu bạn cần được cấp tài khoản.</p></section></main>;
}
