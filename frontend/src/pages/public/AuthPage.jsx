import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FormField } from '../../components/FormField';
import { Feedback } from '../../components/Feedback';
import { safeReturnTo } from '../../services/navigation';

/** Đăng ký/đăng nhập và trả về đúng hành trình đã chọn; không gửi role đặc quyền. */
export function AuthPage({ register = false }) {
  const [params] = useSearchParams();
  const next = safeReturnTo(params.get('next'));
  const { user, loading, authenticate } = useAuth();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Gửi thông tin đăng nhập/đăng ký và hiển thị lỗi do API trả về.
  async function submit(event) {
    event.preventDefault(); setError(''); setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await authenticate(register ? 'register' : 'login', values); }
    catch (failure) { setError(failure.message || 'Không thể kết nối máy chủ.'); }
    finally { setSaving(false); }
  }
  if (!loading && user) return <Navigate to={next} replace />;
  return <div className="auth-page container"><section className="auth-story"><span className="eyebrow">MỞ RA NHỮNG ĐIỀU MỚI</span><h1>{register ? 'Một tài khoản.\nNhiều hành trình.' : 'Chào mừng bạn\ntrở lại.'}</h1><p>{register ? 'Lưu thông tin của bạn và sẵn sàng cho chuyến đi tiếp theo.' : 'Đăng nhập để tiếp tục hành trình đã chọn và quản lý tài khoản của bạn.'}</p><div className="auth-art" aria-hidden="true">✦</div><Link to="/" className="text-button">← Tiếp tục khám phá tour</Link></section><section className="auth-card"><span className="eyebrow">{register ? 'BẮT ĐẦU HÀNH TRÌNH' : 'TÀI KHOẢN CỦA BẠN'}</span><h2>{register ? 'Tạo tài khoản' : 'Đăng nhập'}</h2><p className="muted">{next.startsWith('/booking/start') ? 'Lựa chọn tour của bạn sẽ được giữ lại sau khi đăng nhập.' : 'Nhập thông tin để tiếp tục.'}</p><Feedback error={error} /><form onSubmit={submit}>{register && <FormField label="Họ và tên" name="full_name" autoComplete="name" maxLength={150} required />}<FormField label="Email" name="email" type="email" autoComplete="email" maxLength={255} required />{register && <FormField label="Số điện thoại" name="phone" type="tel" autoComplete="tel" maxLength={25} />}<FormField label="Mật khẩu" name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 8 : undefined} maxLength={72} required hint={register ? 'Tối thiểu 8 ký tự, tối đa 72 byte.' : undefined} /><button className="button wide" disabled={saving || loading}>{saving ? 'Đang xử lý…' : register ? 'Tạo tài khoản' : 'Đăng nhập'} <span aria-hidden="true">→</span></button></form><p className="auth-switch">{register ? 'Đã có tài khoản? ' : 'Bạn chưa có tài khoản? '}<Link to={`${register ? '/login' : '/register'}?next=${encodeURIComponent(next)}`}>{register ? 'Đăng nhập' : 'Đăng ký ngay'}</Link></p></section></div>;
}
