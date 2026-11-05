import { useState } from 'react';
import { api } from '../../services/api';
import { useResource } from '../../hooks/useResource';
import { useAuth } from '../../hooks/useAuth';
import { EmptyState, Feedback, RequestState } from '../../components/Feedback';
import { FormField } from '../../components/FormField';

/** Tạo và sửa danh mục hiện hữu; không cung cấp thao tác xóa dữ liệu. */
export function CategoriesPage() {
  const resource = useResource('/manage/categories');
  const { can } = useAuth();
  const [editing, setEditing] = useState(null);
  const [state, setState] = useState({});
  // Tạo mới hoặc sửa đúng danh mục đang chọn, không thay thế toàn bộ danh sách.
  async function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    if (!body.slug) delete body.slug;
    setState({ saving: true });
    try { await (editing ? api.patch('/manage/categories/' + editing.id, body) : api.post('/manage/categories', body)); setState({ success: 'Đã lưu danh mục.' }); setEditing(null); resource.reload(); event.target.reset(); }
    catch (error) { setState({ error: error.message }); }
  }
  return <><span className="eyebrow">NỘI DUNG WEBSITE</span><h1>Danh mục tour</h1><Feedback {...state} /><div className="management-split"><section className="panel"><h2>Danh mục hiện có</h2><RequestState resource={resource}>{resource.data?.length ? <div className="item-list">{resource.data.map(category => <article key={category.id}><div><strong>{category.name}</strong><small>{category.slug}</small><p>{category.description}</p></div>{can('categories.write') && <button className="button small secondary" onClick={() => { setEditing(category); setState({}); }}>Chỉnh sửa</button>}</article>)}</div> : <EmptyState title="Chưa có danh mục">Thêm danh mục đầu tiên để tổ chức tour.</EmptyState>}</RequestState></section>{can('categories.write') && <section className="panel"><h2>{editing ? 'Chỉnh sửa danh mục' : 'Thêm danh mục'}</h2><form key={editing?.id || 'new'} onSubmit={submit}><FormField label="Tên danh mục" name="name" defaultValue={editing?.name || ''} maxLength={100} required /><FormField label="Đường dẫn (slug)" name="slug" defaultValue={editing?.slug || ''} maxLength={150} placeholder="Tự tạo từ tên nếu để trống" /><FormField label="Mô tả" name="description" as="textarea" rows={4} defaultValue={editing?.description || ''} /><div className="button-row"><button className="button" disabled={state.saving}>{state.saving ? 'Đang lưu…' : 'Lưu danh mục'}</button>{editing && <button type="button" className="text-button" onClick={() => setEditing(null)}>Hủy chỉnh sửa</button>}</div></form></section>}</div></>;
}
