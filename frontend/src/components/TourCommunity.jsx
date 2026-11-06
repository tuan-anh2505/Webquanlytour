import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useResource } from '../hooks/useResource';
import { api } from '../services/api';
import { Feedback, Pagination, RequestState, EmptyState } from './Feedback';
import { FormField } from './FormField';
import { dateTime } from '../services/format';

/** Đánh giá công khai, đánh giá chính chủ có kiểm duyệt và nút yêu thích theo đúng phiên Customer. */
export function TourCommunity({ tour }) {
  const { user } = useAuth();
  const navigate = useNavigate(), location = useLocation();
  const [page, setPage] = useState(1), [state, setState] = useState({});
  const reviews = useResource(`/tours/${tour.id}/reviews?page=${page}&limit=6`);
  const own = useResource(user ? `/tours/${tour.id}/review` : null);
  const saved = useResource(user ? `/wishlist/${tour.id}` : null);
  /** Chỉ gửi quan hệ tour/khách; thao tác lặp không sinh bản ghi yêu thích trùng. */
  async function toggle() {
    if (!user) { navigate('/login?next=' + encodeURIComponent(location.pathname)); return; }
    setState({ saving: true });
    try { await (saved.data?.saved ? api.delete(`/wishlist/${tour.id}`) : api.put(`/wishlist/${tour.id}`, {})); saved.reload(); setState({}); }
    catch (error) { setState({ error: error.message }); }
  }
  /** Đánh giá được đưa về pending; chỉ server quyết định khách có thực sự hoàn thành tour. */
  async function submit(event) {
    event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); body.rating = Number(body.rating);
    setState({ saving: true });
    try { await api.put(`/tours/${tour.id}/review`, body); own.reload(); reviews.reload(); setState({ success: 'Đã gửi đánh giá, đang chờ kiểm duyệt.' }); }
    catch (error) { setState({ error: error.message }); }
  }
  return <section className="content-section community-section"><div className="page-heading"><div><span className="eyebrow">CHIA SẺ SAU HÀNH TRÌNH</span><h2>Đánh giá từ khách hàng</h2></div><button className="button secondary small" disabled={state.saving || saved.loading} onClick={toggle}>{saved.data?.saved ? '♥ Đã yêu thích' : '♡ Lưu tour yêu thích'}</button></div><Feedback {...state} /><RequestState resource={reviews}><p className="review-summary"><strong>★ {Number(reviews.summary?.average || 0).toFixed(1)}</strong> / 5 · {reviews.summary?.total || 0} đánh giá đã duyệt</p>{reviews.data?.length ? reviews.data.map(review => <article className="review-card" key={review.id}><div><strong>{review.customer_name}</strong><span aria-label={review.rating + ' trên 5 sao'}>{'★'.repeat(Number(review.rating))}</span></div><p className="prose">{review.comment || 'Khách hàng đã chấm điểm hành trình.'}</p><small className="muted">{dateTime(review.created_at)}</small></article>) : <EmptyState title="Chưa có đánh giá">Nhận xét của khách sau khi hoàn thành tour sẽ xuất hiện tại đây sau kiểm duyệt.</EmptyState>}<Pagination meta={reviews.meta} onChange={setPage} /></RequestState>{user ? <RequestState resource={own}>{own.data?.eligible ? <form className="panel review-form" onSubmit={submit} key={own.data.review?.id || 'new'}><h3>{own.data.review ? 'Cập nhật đánh giá của bạn' : 'Chia sẻ trải nghiệm của bạn'}</h3>{own.data.review && <p className="notice info">Trạng thái: {{ pending: 'Chờ duyệt', published: 'Đã xuất bản', hidden: 'Đã ẩn' }[own.data.review.status]}. Chỉnh sửa sẽ đưa đánh giá về chờ duyệt.</p>}<FormField label="Điểm đánh giá" name="rating" as="select" defaultValue={own.data.review?.rating || 5}>{[5,4,3,2,1].map(value => <option key={value} value={value}>{value} sao</option>)}</FormField><FormField label="Trải nghiệm của bạn" name="comment" as="textarea" rows={4} maxLength={5000} defaultValue={own.data.review?.comment || ''} /><button className="button" disabled={state.saving}>Gửi đánh giá</button></form> : <p className="notice info">Bạn có thể đánh giá khi booking của tour đã được xác nhận hoàn thành chuyến đi.</p>}</RequestState> : <p className="muted"><Link className="text-button" to={'/login?next=' + encodeURIComponent(location.pathname)}>Đăng nhập</Link> để lưu yêu thích và xem điều kiện đánh giá.</p>}</section>;
}
