import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useResource } from '../../hooks/useResource';
import { api } from '../../services/api';
import { Feedback, RequestState, EmptyState, Pagination } from '../../components/Feedback';
import { FormField } from '../../components/FormField';
import { statusLabels } from '../../services/format';

/** Chức năng chỉ dành cho Admin: tạo tài khoản, thay đổi vai trò và cấp quyền Staff. */
export function UsersPage() {
  const { operationsUser: user } = useAuth();
  const [params, setParams] = useSearchParams();
  const resource = useResource(user.role === 'admin' ? '/manage/users?' + params : null);
  const definitions = useResource(user.role === 'admin' ? '/manage/users/permissions' : null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [permissionUser, setPermissionUser] = useState(null);
  const [state, setState] = useState({});
  // Endpoint Admin cho phép đổi vai trò; API bảo vệ Admin hoạt động cuối cùng.
  async function save(event) {
    event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget));
    setState({ saving: true });
    try { await (editing ? api.patch('/manage/users/' + editing.id, body) : api.post('/manage/users', body)); resource.reload(); setEditing(null); setCreating(false); setState({ success: 'Đã lưu tài khoản người dùng.' }); }
    catch (error) { setState({ error: error.message }); }
  }
  function search(event) { event.preventDefault(); const next = new URLSearchParams(); for (const [key, value] of new FormData(event.currentTarget)) if (value) next.set(key, value); setParams(next); }
  function page(value) { const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next); }
  if (user.role !== 'admin') return <div className="notice error">Chỉ Admin được quản lý tài khoản và quyền nhân viên.</div>;
  return <><div className="page-heading"><div><span className="eyebrow">QUẢN TRỊ HỆ THỐNG</span><h1>Người dùng & quyền</h1></div><button className="button" onClick={() => { setCreating(true); setEditing(null); setState({}); }}>+ Tạo tài khoản</button></div><Feedback {...state} /><form className="toolbar" onSubmit={search} key={params.toString()}><label><span className="sr-only">Tìm người dùng</span><input name="q" placeholder="Tìm theo họ tên hoặc email…" defaultValue={params.get('q') || ''} /></label><label><span className="sr-only">Vai trò</span><select name="role" defaultValue={params.get('role') || ''}><option value="">Tất cả vai trò</option><option value="admin">Quản trị viên</option><option value="staff">Nhân viên</option><option value="customer">Khách hàng</option></select></label><button className="button secondary">Tìm kiếm</button></form><RequestState resource={resource}>{resource.data?.length ? <div className="table-wrap"><table><thead><tr><th>Người dùng</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{resource.data.map(item => <tr key={item.id}><td><strong>{item.full_name}</strong><small>{item.email}</small>{String(item.id) === String(user.id) && <small>Bạn</small>}</td><td>{statusLabels[item.role]}</td><td><span className={'badge ' + item.status}>{item.status === 'active' ? 'Hoạt động' : 'Đã khóa'}</span></td><td><div className="button-row"><button className="text-button" onClick={() => { setEditing(item); setCreating(false); setState({}); }}>Chỉnh sửa</button>{item.role === 'staff' && <button className="text-button" onClick={() => setPermissionUser(item)}>Phân quyền</button>}</div></td></tr>)}</tbody></table></div> : <EmptyState title="Không có tài khoản phù hợp">Thử lại với tên hoặc vai trò khác.</EmptyState>}<Pagination meta={resource.meta} onChange={page} /></RequestState>
  {(creating || editing) && <section className="panel editor-form"><h2>{editing ? 'Chỉnh sửa tài khoản' : 'Tạo tài khoản'}</h2><form onSubmit={save} key={editing?.id || 'new-user'}><div className="form-grid"><FormField label="Họ và tên" name="full_name" maxLength={150} defaultValue={editing?.full_name || ''} required /><FormField label="Số điện thoại" name="phone" type="tel" maxLength={25} defaultValue={editing?.phone || ''} />{!editing && <><FormField label="Email" name="email" type="email" maxLength={255} autoComplete="off" required /><FormField label="Mật khẩu ban đầu" name="password" type="password" minLength={8} maxLength={72} autoComplete="new-password" required /></>}<FormField label="Vai trò" name="role" as="select" defaultValue={editing?.role || 'staff'}><option value="staff">Nhân viên</option><option value="customer">Khách hàng</option><option value="admin">Quản trị viên</option></FormField>{editing && <FormField label="Trạng thái" name="status" as="select" defaultValue={editing.status || 'active'}><option value="active">Hoạt động</option><option value="banned">Đã khóa</option></FormField>}</div><p className="muted">Quyền Staff được cấp riêng sau khi tạo tài khoản. Hệ thống bảo vệ tài khoản Admin hoạt động cuối cùng.</p><div className="button-row"><button className="button" disabled={state.saving}>{state.saving ? 'Đang lưu…' : 'Lưu tài khoản'}</button><button className="text-button" type="button" onClick={() => { setEditing(null); setCreating(false); }}>Đóng biểu mẫu</button></div></form></section>}
  {permissionUser && <PermissionEditor key={permissionUser.id} target={permissionUser} definitions={definitions} onClose={() => setPermissionUser(null)} />}
  </>;
}

/** Cấp danh sách permission_key tường minh; backend kiểm tra lại quyền và đối tượng Staff. */
function PermissionEditor({ target, definitions, onClose }) {
  const resource = useResource(`/manage/users/${target.id}/permissions`);
  const [state, setState] = useState({});
  // Gửi danh sách quyền đầy đủ để cấp/thu hồi theo lựa chọn tường minh của Admin.
  async function submit(event) {
    event.preventDefault();
    const permissions = new FormData(event.currentTarget).getAll('permissions');
    setState({ saving: true });
    try { await api.put(`/manage/users/${target.id}/permissions`, { permissions }); setState({ success: 'Đã cập nhật quyền nhân viên.' }); resource.reload(); }
    catch (error) { setState({ error: error.message }); }
  }
  return <section className="panel editor-form"><div className="page-heading"><div><h2>Phân quyền: {target.full_name}</h2><p className="muted">{target.email}</p></div><button className="text-button" onClick={onClose}>Đóng</button></div><Feedback {...state} /><p className="notice info">Quyền đọc và ghi độc lập. Để chỉnh sửa tour, cấp cả quyền đọc tour và ghi tour. Để quản lý lịch khởi hành từ trang tour, cấp thêm quyền đọc lịch và ghi lịch.</p><RequestState resource={definitions}><RequestState resource={resource}><form onSubmit={submit} key={JSON.stringify(resource.data)}><div className="permission-grid">{(definitions.data || []).map(definition => <label className="permission-option" key={definition.key}><input type="checkbox" name="permissions" value={definition.key} defaultChecked={resource.data?.includes(definition.key)} /><span><strong>{definition.label}</strong><small>{definition.key}</small></span></label>)}</div><button className="button" disabled={state.saving}>{state.saving ? 'Đang lưu…' : 'Lưu phân quyền'}</button></form></RequestState></RequestState></section>;
}
