import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useResource } from '../../hooks/useResource';
import { api } from '../../services/api';
import { Feedback, RequestState, EmptyState, Pagination } from '../../components/Feedback';
import { FormField } from '../../components/FormField';

/** Hồ sơ hướng dẫn viên dùng bảng guides, không tạo role/login mới. */
export function GuidesPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const resource = useResource('/manage/guides?' + params);
  const [editing, setEditing] = useState(null), [open, setOpen] = useState(false), [state, setState] = useState({});
  async function save(event) {
    event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); setState({ saving: true });
    try { await (editing ? api.patch('/manage/guides/' + editing.id, body) : api.post('/manage/guides', body)); resource.reload(); setOpen(false); setEditing(null); setState({ success: 'Đã lưu hồ sơ hướng dẫn viên.' }); }
    catch (error) { setState({ error: error.message }); }
  }
  function search(event) { event.preventDefault(); setParams(Object.fromEntries([...new FormData(event.currentTarget)].filter(([,value]) => value))); }
  return <><div className="page-heading"><h1>Hướng dẫn viên</h1>{can('guides.write') && <button className="button" onClick={() => { setEditing(null); setOpen(true); }}>+ Thêm hướng dẫn viên</button>}</div><Feedback {...state} /><form className="toolbar" onSubmit={search}><label><span className="sr-only">Tìm hướng dẫn viên</span><input name="q" placeholder="Tên, ngôn ngữ…" defaultValue={params.get('q') || ''} /></label><select name="status" aria-label="Trạng thái" defaultValue={params.get('status') || ''}><option value="">Mọi trạng thái</option><option value="active">Hoạt động</option><option value="inactive">Ngưng hoạt động</option></select><button className="button secondary">Tìm kiếm</button></form><RequestState resource={resource}>{resource.data?.length ? <div className="table-wrap"><table><thead><tr><th>Hướng dẫn viên</th><th>Liên hệ</th><th>Ngôn ngữ</th><th>Trạng thái</th><th /></tr></thead><tbody>{resource.data.map(guide => <tr key={guide.id}><td><strong>{guide.full_name}</strong></td><td>{guide.phone}<small>{guide.email}</small></td><td>{guide.languages || '—'}</td><td>{guide.status === 'active' ? 'Hoạt động' : 'Ngưng hoạt động'}</td><td>{can('guides.write') && <button className="text-button" onClick={() => { setEditing(guide); setOpen(true); }}>Chỉnh sửa</button>}</td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có hướng dẫn viên">Thêm hồ sơ để phân công cho từng chuyến đi.</EmptyState>}<Pagination meta={resource.meta} onChange={page => { const next = new URLSearchParams(params); next.set('page', page); setParams(next); }} /></RequestState>{open && can('guides.write') && <section className="panel editor-form"><h2>{editing ? 'Sửa hồ sơ' : 'Thêm hướng dẫn viên'}</h2><form key={editing?.id || 'new'} onSubmit={save}><div className="form-grid"><FormField label="Họ và tên" name="full_name" defaultValue={editing?.full_name || ''} maxLength={150} required /><FormField label="Điện thoại" name="phone" defaultValue={editing?.phone || ''} maxLength={25} /><FormField label="Email" name="email" type="email" defaultValue={editing?.email || ''} maxLength={255} /><FormField label="Ngôn ngữ" name="languages" defaultValue={editing?.languages || ''} maxLength={255} /><FormField label="Trạng thái" name="status" as="select" defaultValue={editing?.status || 'active'}><option value="active">Hoạt động</option><option value="inactive">Ngưng hoạt động</option></FormField></div><FormField label="Giới thiệu / kinh nghiệm" name="bio" as="textarea" rows={4} maxLength={15000} defaultValue={editing?.bio || ''} /><p className="muted">Cần gỡ phân công chuyến chưa kết thúc trước khi ngưng hoạt động.</p><div className="button-row"><button className="button" disabled={state.saving}>Lưu hồ sơ</button><button type="button" className="text-button" onClick={() => setOpen(false)}>Đóng</button></div></form></section>}</>;
}
