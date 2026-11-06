import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useResource } from '../../hooks/useResource';
import { api } from '../../services/api';
import { Feedback, RequestState, EmptyState, Pagination } from '../../components/Feedback';
import { FormField } from '../../components/FormField';
import { dateTime } from '../../services/format';

/** Nội dung biên tập có nháp/xuất bản/ẩn, không xóa dữ liệu bài viết. */
export function ManageArticlesPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const resource = useResource('/manage/articles?' + params);
  function search(event) { event.preventDefault(); setParams(Object.fromEntries([...new FormData(event.currentTarget)].filter(([,value]) => value))); }
  return <><div className="page-heading"><h1>Bài viết & tin tức</h1>{can('articles.write') && <Link className="button" to="/admin/articles/new">+ Viết bài</Link>}</div><form className="toolbar" onSubmit={search}><label><span className="sr-only">Tìm bài viết</span><input name="q" placeholder="Tiêu đề, nội dung…" defaultValue={params.get('q') || ''} /></label><select name="status" aria-label="Trạng thái" defaultValue={params.get('status') || ''}><option value="">Mọi trạng thái</option><option value="draft">Nháp</option><option value="published">Xuất bản</option><option value="hidden">Đã ẩn</option></select><button className="button secondary">Tìm kiếm</button></form><RequestState resource={resource}>{resource.data?.length ? <div className="table-wrap"><table><thead><tr><th>Bài viết</th><th>Tác giả</th><th>Ngày xuất bản</th><th>Trạng thái</th><th /></tr></thead><tbody>{resource.data.map(article => <tr key={article.id}><td><strong>{article.title}</strong></td><td>{article.author_name}</td><td>{dateTime(article.published_at)}</td><td><span className={'badge ' + article.status}>{{ draft: 'Nháp', published: 'Xuất bản', hidden: 'Đã ẩn' }[article.status]}</span></td><td><Link className="text-button" to={'/admin/articles/' + article.id}>Chi tiết →</Link></td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có bài viết">Tạo nội dung mới cho mục tin tức và cẩm nang.</EmptyState>}<Pagination meta={resource.meta} onChange={page => { const next = new URLSearchParams(params); next.set('page', page); setParams(next); }} /></RequestState></>;
}

/** Biên tập văn bản và metadata SEO; tác giả/ngày xuất bản do backend kiểm soát. */
export function ArticleEditorPage() {
  const { id } = useParams(), navigate = useNavigate(), { can } = useAuth();
  const resource = useResource(id ? '/manage/articles/' + id : null);
  const article = resource.data || {};
  const [state, setState] = useState({});
  async function save(event) {
    event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); if (!body.slug) delete body.slug; setState({ saving: true });
    try { const result = await (id ? api.patch('/manage/articles/' + id, body) : api.post('/manage/articles', body)); setState({ success: 'Đã lưu bài viết.' }); if (!id) navigate('/admin/articles/' + result.data.id, { replace: true }); else resource.reload(); }
    catch (error) { setState({ error: error.message }); }
  }
  return <><Link className="text-button" to="/admin/articles">← Danh sách bài viết</Link><h1>{id ? 'Nội dung bài viết' : 'Viết bài mới'}</h1><Feedback {...state} /><RequestState resource={resource}><section className="panel"><form onSubmit={save} key={article.id || 'new'}><fieldset disabled={!can('articles.write') || state.saving}><FormField label="Tiêu đề" name="title" maxLength={255} defaultValue={article.title || ''} required /><div className="form-grid"><FormField label="Slug (tự tạo khi để trống)" name="slug" defaultValue={article.slug || ''} maxLength={255} /><FormField label="Trạng thái" name="status" as="select" defaultValue={article.status || 'draft'}><option value="draft">Nháp</option><option value="published">Xuất bản</option><option value="hidden">Đã ẩn</option></FormField></div><FormField label="Ảnh bìa (URL)" name="cover_image_url" defaultValue={article.cover_image_url || ''} maxLength={1024} /><FormField label="Tóm tắt" name="summary" as="textarea" rows={3} maxLength={5000} defaultValue={article.summary || ''} /><FormField label="Nội dung" name="content" as="textarea" rows={18} maxLength={100000} defaultValue={article.content || ''} required hint="Nội dung văn bản an toàn; xuống dòng để chia đoạn." /><FormField label="Tiêu đề SEO" name="meta_title" maxLength={255} defaultValue={article.meta_title || ''} /><FormField label="Mô tả SEO" name="meta_description" as="textarea" rows={2} maxLength={500} defaultValue={article.meta_description || ''} />{can('articles.write') && <button className="button" disabled={state.saving}>Lưu bài viết</button>}</fieldset></form>{article.status === 'published' && <Link className="text-button" target="_blank" rel="noreferrer" to={'/articles/' + article.slug}>Xem bài công khai ↗</Link>}</section></RequestState></>;
}
