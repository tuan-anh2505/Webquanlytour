import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useResource } from '../../hooks/useResource';
import { api } from '../../services/api';
import { Feedback, EmptyState, RequestState, Pagination } from '../../components/Feedback';
import { dateTime } from '../../services/format';

/** Kiểm duyệt là quyền riêng, Staff chỉ đọc không thể đổi trạng thái review. */
export function ReviewsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const resource = useResource('/manage/reviews?' + params);
  const [state, setState] = useState({});
  async function moderate(id, status) { setState({ saving: true }); try { await api.patch('/manage/reviews/' + id, { status }); resource.reload(); setState({ success: 'Đã cập nhật trạng thái đánh giá.' }); } catch (error) { setState({ error: error.message }); } }
  function search(event) { event.preventDefault(); setParams(Object.fromEntries([...new FormData(event.currentTarget)].filter(([,value]) => value))); }
  return <><h1>Kiểm duyệt đánh giá</h1><Feedback {...state} /><form className="toolbar" onSubmit={search}><label><span className="sr-only">Tìm đánh giá</span><input name="q" placeholder="Tour, tên khách, nội dung…" defaultValue={params.get('q') || ''} /></label><select name="status" aria-label="Trạng thái" defaultValue={params.get('status') || ''}><option value="">Mọi trạng thái</option><option value="pending">Chờ duyệt</option><option value="published">Xuất bản</option><option value="hidden">Ẩn</option></select><button className="button secondary">Tìm kiếm</button></form><RequestState resource={resource}>{resource.data?.length ? resource.data.map(review => <article className="panel" key={review.id}><div className="page-heading"><div><h2>{review.tour_title}</h2><p>{review.customer_name} · {'★'.repeat(Number(review.rating))} · {dateTime(review.created_at)}</p></div><span className={'badge ' + review.status}>{{ pending: 'Chờ duyệt', published: 'Xuất bản', hidden: 'Ẩn' }[review.status]}</span></div><p className="prose">{review.comment || 'Chỉ chấm điểm.'}</p>{can('reviews.write') && <div className="button-row"><button className="button small" disabled={state.saving || review.status === 'published'} onClick={() => moderate(review.id, 'published')}>Duyệt xuất bản</button><button className="button small secondary" disabled={state.saving || review.status === 'hidden'} onClick={() => moderate(review.id, 'hidden')}>Ẩn đánh giá</button><button className="text-button" disabled={state.saving || review.status === 'pending'} onClick={() => moderate(review.id, 'pending')}>Đưa về chờ duyệt</button></div>}</article>) : <EmptyState title="Không có đánh giá phù hợp">Đánh giá mới của khách sẽ vào trạng thái chờ duyệt.</EmptyState>}<Pagination meta={resource.meta} onChange={page => { const next = new URLSearchParams(params); next.set('page', page); setParams(next); }} /></RequestState></>;
}
