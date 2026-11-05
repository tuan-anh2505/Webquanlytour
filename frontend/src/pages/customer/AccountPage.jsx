import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import { dateTime, statusLabels } from '../../services/format';
import { Feedback } from '../../components/Feedback';
import { FormField } from '../../components/FormField';

/** Khách chỉ cập nhật thông tin cá nhân của chính mình qua endpoint /auth/me. */
export function AccountPage() {
  const { user, setUser } = useAuth();
  const [state, setState] = useState({ error: '', success: '', saving: false });
  // Chỉ gửi họ tên và điện thoại; không cho phép tự sửa vai trò hay trạng thái.
  async function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setState({ error: '', success: '', saving: true });
    try { const result = await api.patch('/auth/me', body); setUser(result.data); setState({ error: '', success: 'Đã cập nhật thông tin tài khoản.', saving: false }); }
    catch (error) { setState({ error: error.message, success: '', saving: false }); }
  }
  return <div className="container narrow page-space"><span className="eyebrow">KHÔNG GIAN CỦA BẠN</span><h1>Thông tin tài khoản</h1><p className="muted">Quản lý thông tin liên hệ cho các hành trình sắp tới.</p><div className="panel"><Feedback {...state} /><form onSubmit={submit} key={user.id}><FormField label="Họ và tên" name="full_name" defaultValue={user.full_name} maxLength={150} autoComplete="name" required /><FormField label="Số điện thoại" name="phone" type="tel" defaultValue={user.phone || ''} maxLength={25} autoComplete="tel" /><dl className="profile-details"><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Vai trò</dt><dd>{statusLabels[user.role]}</dd></div><div><dt>Ngày tham gia</dt><dd>{dateTime(user.created_at)}</dd></div></dl><button className="button" disabled={state.saving}>{state.saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button></form></div><div className="subtle-panel"><h2>Hành trình tiếp theo</h2><p>Khám phá các tour đang mở và chọn lịch khởi hành phù hợp.</p><div className="button-row"><Link className="text-button" to="/bookings">Booking của tôi →</Link><Link className="text-button" to="/">Xem tour →</Link></div></div></div>;
}
