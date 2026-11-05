import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource';
import { useAuth } from '../../hooks/useAuth';
import { EmptyState, RequestState } from '../../components/Feedback';
import { bookingPath } from '../../services/navigation';
import { dateTime, money } from '../../services/format';

/** Chi tiết tour và lịch công khai; yêu cầu đăng nhập chỉ khi bấm bắt đầu đặt. */
export function TourDetailPage() {
  const { slug } = useParams();
  const resource = useResource('/tours/' + encodeURIComponent(slug));
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState('');
  const tour = resource.data;
  const schedules = tour?.schedules || [];
  useEffect(() => { setSelected(''); }, [slug]);
  const selection = schedules.find(schedule => String(schedule.id) === selected);
  // Giữ lịch đã chọn; khách chưa đăng nhập được chuyển qua màn hình xác thực.
  function startBooking() {
    if (!selection || Number(selection.available_seats) <= 0) return;
    const next = bookingPath(tour.id, selection.id);
    navigate(user ? next : '/login?next=' + encodeURIComponent(next));
  }
  return <div className="container page-space"><RequestState resource={resource}>{tour && <>
    <nav className="breadcrumb" aria-label="Đường dẫn"><Link to="/">Khám phá tour</Link><span>/</span><span>{tour.title}</span></nav><div className="detail-heading"><div><span className="eyebrow">{tour.tour_type === 'international' ? 'HÀNH TRÌNH QUỐC TẾ' : 'HÀNH TRÌNH TRONG NƯỚC'}</span><h1>{tour.title}</h1><p className="muted">⌖ {tour.destination || 'Điểm đến đang cập nhật'} <span className="dot">·</span> {tour.duration_days} ngày {tour.duration_nights} đêm {tour.departure_location && <><span className="dot">·</span> Khởi hành từ {tour.departure_location}</>}</p></div></div>
    {tour.images?.length ? <div className="detail-gallery">{tour.images.slice(0, 3).map(image => <img key={image.id} src={image.image_url} alt={image.alt_text || tour.title} loading="lazy" />)}</div> : <div className="detail-placeholder"><span>✦</span><p>Một hành trình mới, nhiều điều để khám phá</p></div>}
    <div className="detail-layout"><div className="detail-content">{tour.summary && <p className="lead">{tour.summary}</p>}{[['Giới thiệu hành trình', 'description'], ['Điểm nổi bật', 'highlights'], ['Dịch vụ bao gồm', 'included_services'], ['Dịch vụ không bao gồm', 'excluded_services']].map(([title, key]) => tour[key] && <section className="content-section" key={key}><h2>{title}</h2><p className="prose">{tour[key]}</p></section>)}<section className="content-section"><h2>Lịch trình khám phá</h2>{tour.itineraries?.length ? <div className="itinerary">{tour.itineraries.map(day => <article key={day.id}><span className="day-number">{String(day.day_number).padStart(2, '0')}</span><div><h3>Ngày {day.day_number}: {day.title}</h3><p className="prose">{day.content}</p></div></article>)}</div> : <p className="muted">Lịch trình chi tiết đang được cập nhật.</p>}</section>{tour.cancellation_policy && <section className="content-section"><h2>Chính sách hủy</h2><p className="prose">{tour.cancellation_policy}</p></section>}</div>
    <aside className="booking-card"><span className="eyebrow">CHỌN NGÀY ĐI CỦA BẠN</span><h2>Lịch khởi hành</h2><p className="muted">Giá người lớn từ</p><div className="big-price">{money(selection?.adult_price ?? tour.base_price)}</div>{schedules.length ? <><label className="field"><span>Ngày khởi hành</span><select value={selected} onChange={event => setSelected(event.target.value)}><option value="">Chọn một lịch khởi hành</option>{schedules.map(schedule => <option value={schedule.id} key={schedule.id} disabled={Number(schedule.available_seats) <= 0}>{dateTime(schedule.departure_date)} · {Number(schedule.available_seats) > 0 ? `${schedule.available_seats} chỗ còn lại` : 'Hết chỗ'}</option>)}</select></label>{selection && <dl className="price-breakdown"><div><dt>Người lớn</dt><dd>{money(selection.adult_price)}</dd></div><div><dt>Trẻ em</dt><dd>{money(selection.child_price)}</dd></div><div><dt>Em bé</dt><dd>{money(selection.infant_price)}</dd></div><div><dt>Số chỗ còn lại</dt><dd>{selection.available_seats}</dd></div>{selection.return_date && <div><dt>Ngày về</dt><dd>{dateTime(selection.return_date)}</dd></div>}</dl>}<button className="button wide" disabled={!selection || Number(selection.available_seats) <= 0} onClick={startBooking}>Đặt tour <span aria-hidden="true">→</span></button><p className="booking-note">{user ? 'Tiếp tục với tài khoản của bạn.' : 'Bạn chỉ cần đăng nhập khi bắt đầu đặt tour.'} Giá và số chỗ sẽ được kiểm tra lại khi xác nhận.</p></> : <EmptyState title="Chưa có lịch mở">Vui lòng quay lại sau để xem lịch khởi hành mới.</EmptyState>}</aside></div>
    </>}</RequestState></div>;
}
