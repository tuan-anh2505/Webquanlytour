import { Link, useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource';
import { EmptyState, Pagination, RequestState } from '../../components/Feedback';
import { BookingsTable } from '../../components/BookingRecord';
import { bookingStatuses } from '../../services/booking';

/** Danh sách dùng chung; API Customer tự giới hạn đơn theo chủ tài khoản từ JWT. */
export function BookingsPage({ manage = false }) {
  const [params, setParams] = useSearchParams();
  const resource = useResource((manage ? '/manage/bookings?' : '/bookings?') + params);
  /** Lưu bộ lọc vào URL, quay về trang đầu khi tìm kiếm lại. */
  function search(event) {
    event.preventDefault();
    const query = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) if (value) query.set(key, value);
    setParams(query);
  }
  function changePage(page) { const query = new URLSearchParams(params); query.set('page', String(page)); setParams(query); }
  return <div className={manage ? '' : 'container page-space'}><div className="page-heading"><div><span className="eyebrow">{manage ? 'ĐIỀU HÀNH ĐẶT TOUR' : 'HÀNH TRÌNH CỦA BẠN'}</span><h1>{manage ? 'Quản lý booking' : 'Booking của tôi'}</h1></div>{!manage && <Link className="button secondary" to="/">Khám phá tour</Link>}</div><form className="toolbar" onSubmit={search} key={params.toString()}><label><span className="sr-only">Tìm booking</span><input name="q" placeholder={manage ? 'Mã booking, tour, tên hoặc email liên hệ…' : 'Tìm mã booking hoặc tour…'} defaultValue={params.get('q') || ''} maxLength={150} /></label><label><span className="sr-only">Trạng thái booking</span><select name="status" defaultValue={params.get('status') || ''}><option value="">Tất cả trạng thái</option>{Object.entries(bookingStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="button secondary">Tìm kiếm</button></form><RequestState resource={resource}><p className="muted booking-small">{resource.meta?.total || 0} booking phù hợp</p>{resource.data?.length ? <BookingsTable bookings={resource.data} manage={manage} /> : <EmptyState title="Chưa có booking phù hợp">{manage ? 'Các đơn đặt tour sẽ xuất hiện tại đây khi khách tạo booking.' : 'Bạn có thể chọn một tour và lịch khởi hành để bắt đầu đặt.'}</EmptyState>}<Pagination meta={resource.meta} onChange={changePage} /></RequestState></div>;
}
