import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource';
import { useAuth } from '../../hooks/useAuth';
import { useServerClock } from '../../hooks/useServerClock';
import { api } from '../../services/api';
import { BookingRecord } from '../../components/BookingRecord';
import { Feedback, RequestState } from '../../components/Feedback';
import { FormField } from '../../components/FormField';
import { holdSeconds, vietnamTimestamp } from '../../services/booking';
import { CustomerTripInfo } from './CommunityPages';

/** Chi tiết booking theo đúng cổng; trạng thái và quyền sở hữu đều do API kiểm tra. */
export function BookingDetailPage({ manage = false }) {
  const { id } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const base = (manage ? '/manage/bookings/' : '/bookings/') + encodeURIComponent(id);
  const resource = useResource(base);
  const [state, setState] = useState({});
  const [cancelling, setCancelling] = useState(false);
  const booking = resource.data;
  const serverNow = useServerClock(booking?.server_now);
  const editable = !manage || can('bookings.write');
  const canCancel = booking && editable && ['pending', 'confirmed'].includes(booking.status) && vietnamTimestamp(booking.departure_date) > serverNow;
  const payable = booking?.status === 'pending' && Number(booking.total_price) > 0;
  const paid = booking?.payments?.some(payment => payment.status === 'success') || Number(booking?.total_price) === 0;

  /** Tạo giao dịch đúng số tiền trên server; UI không tự chuyển booking sang đã thanh toán. */
  async function pay() {
    if (state.saving) return;
    setState({ saving: true });
    try {
      const result = await api.post('/bookings/' + id + '/payments', {});
      navigate('/payments/' + encodeURIComponent(result.data.payment_reference));
    } catch (error) { setState({ error: error.message }); resource.reload(); }
  }
  /** Hủy chỉ sau khi người dùng nhập lý do và xác nhận rõ, sau đó đọc lại trạng thái từ server. */
  async function cancel(event) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get('reason');
    setState({ saving: true });
    try { await api.post(base + '/cancel', { reason }); setCancelling(false); setState({ success: 'Đã xử lý yêu cầu hủy. Vui lòng xem trạng thái booking và hoàn tiền bên dưới.' }); resource.reload(); }
    catch (error) { setState({ error: error.message }); }
  }
  /** Nhân viên xác nhận theo quyền được cấp; API vẫn kiểm tra thanh toán, hạn giữ chỗ và trạng thái. */
  async function confirm() {
    setState({ saving: true });
    try { await api.post(base + '/confirm', {}); setState({ success: 'Đã xác nhận booking.' }); resource.reload(); }
    catch (error) { setState({ error: error.message }); }
  }

  return <div className={manage ? '' : 'container page-space booking-record-page'}><Link className="text-button" to={manage ? '/admin/bookings' : '/bookings'}>← Danh sách booking</Link><div className="page-heading"><div><span className="eyebrow">CHI TIẾT ĐẶT TOUR</span><h1>Thông tin booking</h1></div><button className="button secondary small" onClick={resource.reload}>Làm mới trạng thái</button></div><Feedback {...state} /><RequestState resource={resource}>{booking && <><BookingRecord booking={booking} manage={manage} paymentLinks={!manage || can('payments.read')} />{!manage && ['confirmed','completed'].includes(booking.status) && <CustomerTripInfo bookingId={booking.id} />}<section className="panel booking-actions"><h2>Thao tác</h2>{booking.status === 'confirmed' && <p className="notice success">Booking đã được xác nhận. Vui lòng theo dõi thông tin hành trình và liên hệ công ty khi cần hỗ trợ.</p>}{['expired', 'cancelled'].includes(booking.status) && <p className="notice info">Booking này không còn giữ chỗ. Nếu muốn đi tiếp, vui lòng chọn lịch và tạo booking mới.</p>}<div className="button-row">{!manage && payable && <button className="button" onClick={pay} disabled={state.saving || !holdSeconds(booking.hold_expires_at, serverNow)}>{state.saving ? 'Đang xử lý…' : 'Thanh toán thử nghiệm'}</button>}{manage && can('bookings.write') && booking.status === 'pending' && <button className="button" onClick={confirm} disabled={state.saving || !paid}>Xác nhận booking</button>}{canCancel && <button className="button secondary" disabled={state.saving} onClick={() => setCancelling(true)}>Hủy booking</button>}<Link className="text-button" to={'/tours/' + encodeURIComponent(booking.tour_slug || '')}>Xem tour</Link></div>{manage && booking.status === 'pending' && !paid && <p className="booking-small muted">Chỉ xác nhận sau khi hệ thống đã ghi nhận thanh toán thành công, hoặc booking có tổng tiền bằng 0.</p>}{!manage && payable && <p className="booking-small muted">Thanh toán hiện dùng môi trường mô phỏng; không thu tiền thật và không yêu cầu thông tin thẻ.</p>}{cancelling && canCancel && <form className="editor-form" onSubmit={cancel}><h3>Xác nhận hủy booking</h3><p className="muted">Chỗ đã giữ sẽ được giải phóng. Giao dịch đã thanh toán sẽ được xử lý theo luồng hoàn tiền; yêu cầu hoàn tiền chưa đồng nghĩa tiền đã được hoàn.</p><FormField label="Lý do hủy" name="reason" as="textarea" rows={3} maxLength={500} required /><label className="checkbox"><input type="checkbox" required /><span>Tôi xác nhận muốn hủy booking này.</span></label><div className="button-row"><button className="button danger" disabled={state.saving}>Xác nhận hủy</button><button className="text-button" type="button" onClick={() => setCancelling(false)}>Giữ booking</button></div></form>}</section></>}</RequestState></div>;
}
