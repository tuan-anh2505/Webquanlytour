import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource';
import { api } from '../../services/api';
import { Feedback, EmptyState, Pagination, RequestState } from '../../components/Feedback';
import { dateTime, money } from '../../services/format';

/** Thông báo riêng theo đúng cổng, không hiển thị hàng đợi email nội bộ. */
export function NotificationsPage({ manage = false }) {
  const [params, setParams] = useSearchParams();
  const base = manage ? '/manage/notifications' : '/notifications';
  const resource = useResource(base + '?' + params);
  const [state, setState] = useState({});
  async function read(id) {
    setState({ saving: true });
    try { if (id) await api.patch(base + '/' + id + '/read', {}); else await api.post(base + '/read-all', {}); resource.reload(); setState({}); }
    catch (error) { setState({ error: error.message }); }
  }
  return <div className={manage ? '' : 'container narrow page-space'}><div className="page-heading"><div><span className="eyebrow">CẬP NHẬT DÀNH CHO BẠN</span><h1>Thông báo</h1><p className="muted">{resource.unread || 0} thông báo chưa đọc</p></div><button className="button secondary small" disabled={state.saving} onClick={() => read()}>Đánh dấu tất cả đã đọc</button></div><Feedback {...state} /><RequestState resource={resource}>{resource.data?.length ? resource.data.map(item => <article className={'panel notification-item ' + (item.is_read ? '' : 'unread')} key={item.id}><small className="muted">{dateTime(item.created_at, true)}</small><h2>{item.title}</h2><p>{item.message}</p><div className="button-row">{item.link_url?.startsWith('/') && !item.link_url.startsWith('//') && <Link className="text-button" to={item.link_url} onClick={() => read(item.id)}>Xem thông tin →</Link>}{!item.is_read && <button className="text-button" disabled={state.saving} onClick={() => read(item.id)}>Đã đọc</button>}</div></article>) : <EmptyState title="Chưa có thông báo">Các cập nhật booking và chuyến đi sẽ xuất hiện tại đây.</EmptyState>}<Pagination meta={resource.meta} onChange={page => setParams({ page })} /></RequestState></div>;
}

/** Danh sách yêu thích của Customer, xóa chỉ quan hệ yêu thích theo thao tác người dùng. */
export function WishlistPage() {
  const [params, setParams] = useSearchParams();
  const resource = useResource('/wishlist?' + params);
  const [state, setState] = useState({});
  async function remove(id) { setState({ saving: true }); try { await api.delete('/wishlist/' + id); resource.reload(); setState({}); } catch (error) { setState({ error: error.message }); } }
  return <div className="container page-space"><span className="eyebrow">LƯU LẠI CHO CHUYẾN ĐI SAU</span><h1>Tour yêu thích</h1><Feedback {...state} /><RequestState resource={resource}>{resource.data?.length ? <div className="article-grid">{resource.data.map(tour => <article className="article-card" key={tour.id}>{tour.featured_image_url && <img src={tour.featured_image_url} alt={tour.title} loading="lazy" />}<div><h2><Link to={'/tours/' + tour.slug}>{tour.title}</Link></h2><p>{tour.destination} · {tour.duration_days} ngày {tour.duration_nights} đêm</p><strong>{money(tour.base_price)}</strong><div className="button-row"><Link className="text-button" to={'/tours/' + tour.slug}>Xem hành trình →</Link><button className="text-button" disabled={state.saving} onClick={() => remove(tour.id)}>Bỏ yêu thích</button></div></div></article>)}</div> : <EmptyState title="Chưa có tour yêu thích">Mở chi tiết tour rồi bấm Lưu tour yêu thích để tạo danh sách của bạn.</EmptyState>}<Pagination meta={resource.meta} onChange={page => setParams({ page })} /></RequestState></div>;
}

/** Khách theo dõi trạng thái kiểm duyệt và quay lại tour để sửa đánh giá. */
export function MyReviewsPage() {
  const [params, setParams] = useSearchParams();
  const resource = useResource('/reviews/me?' + params);
  return <div className="container narrow page-space"><h1>Đánh giá của tôi</h1><RequestState resource={resource}>{resource.data?.length ? resource.data.map(review => <article className="panel" key={review.id}><span className={'badge ' + review.status}>{{ pending: 'Chờ duyệt', published: 'Đã xuất bản', hidden: 'Đã ẩn' }[review.status]}</span><h2 className="section-spacer">{review.tour_title}</h2><p>{'★'.repeat(Number(review.rating))}</p><p className="prose">{review.comment}</p><Link className="text-button" to={'/tours/' + review.tour_slug}>Xem/sửa đánh giá →</Link></article>) : <EmptyState title="Chưa có đánh giá">Bạn có thể đánh giá tour sau khi chuyến đi đã hoàn thành.</EmptyState>}<Pagination meta={resource.meta} onChange={page => setParams({ page })} /></RequestState></div>;
}

/** Thông tin vận hành chỉ tải cho booking đã xác nhận/hoàn thành của chính chủ. */
export function CustomerTripInfo({ bookingId }) {
  const resource = useResource(`/bookings/${bookingId}/trip`);
  const trip = resource.data;
  return <section className="panel"><h2>Thông tin chuyến đi</h2><RequestState resource={resource}>{trip && <><dl className="profile-details">{[['Điểm tập trung','meeting_point'],['Giờ tập trung','meeting_time'],['Di chuyển','transport_info'],['Lưu trú','accommodation_info'],['Liên hệ khẩn cấp','emergency_phone']].map(([label,key]) => trip[key] && <div key={key}><dt>{label}</dt><dd className="prose">{key === 'meeting_time' ? dateTime(trip[key], true) : trip[key]}</dd></div>)}</dl>{trip.customer_instructions && <p className="notice info prose">{trip.customer_instructions}</p>}<h3>Hướng dẫn viên</h3>{trip.guides?.length ? trip.guides.map((guide,index) => <p key={index}><strong>{guide.full_name}</strong> {guide.is_lead ? '· Trưởng đoàn' : ''}{guide.phone && <> · {guide.phone}</>}{guide.languages && <> · {guide.languages}</>}</p>) : <p className="muted">Công ty đang cập nhật phân công hướng dẫn viên.</p>}</>}</RequestState></section>;
}
