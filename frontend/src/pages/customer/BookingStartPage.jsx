import { Link, useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource';
import { RequestState } from '../../components/Feedback';
import { dateTime, money } from '../../services/format';

/** Giữ lựa chọn sau đăng nhập; tạo booking/thanh toán sẽ được bổ sung ở Giai đoạn 2. */
export function BookingStartPage() {
  const [params] = useSearchParams();
  const tourId = params.get('tour');
  const resource = useResource(tourId && /^\d+$/.test(tourId) ? '/tours/' + tourId : null);
  const tour = resource.data;
  const schedule = tour?.schedules?.find(item => String(item.id) === params.get('schedule'));
  return (
    <div className="container narrow page-space">
      <span className="eyebrow">LỰA CHỌN CỦA BẠN</span>
      <h1>Bắt đầu hành trình</h1>
      <RequestState resource={resource}>
        {tour && schedule ? (
          <div className="panel">
            <h2>{tour.title}</h2>
            <dl className="profile-details">
              <div><dt>Ngày khởi hành</dt><dd>{dateTime(schedule.departure_date, true)}</dd></div>
              <div><dt>Giá người lớn</dt><dd>{money(schedule.adult_price)}</dd></div>
              <div><dt>Số chỗ đang còn</dt><dd>{schedule.available_seats}</dd></div>
            </dl>
            {Number(schedule.available_seats) <= 0 ? (
              <div className="notice error" role="alert">Lịch khởi hành hiện đã hết chỗ. Vui lòng chọn một lịch khác.</div>
            ) : (
              <div className="notice info" role="status">Bạn đã đăng nhập và có thể xem lại lựa chọn của mình tại đây. Đặt tour trực tuyến đang được hoàn thiện; vui lòng liên hệ công ty để được hỗ trợ. Hiện chưa tạo đơn hay giữ chỗ.</div>
            )}
            <Link className="button secondary" to={`/tours/${encodeURIComponent(tour.slug || tour.id)}`}>← Quay lại lịch khởi hành</Link>
          </div>
        ) : (
          <div className="panel">
            <h2>Lựa chọn không còn khả dụng</h2>
            <p>Lịch khởi hành có thể đã thay đổi hoặc đường dẫn chưa đầy đủ. Vui lòng chọn lại tour.</p>
            <Link className="button" to="/">Khám phá tour</Link>
          </div>
        )}
      </RequestState>
    </div>
  );
}
