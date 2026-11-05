import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import { Feedback, RequestState } from '../../components/Feedback';
import { FormField } from '../../components/FormField';
import { bookingStatuses, paymentStatuses, refundStatuses, friendlyRefundReason } from '../../services/booking';
import { money, dateTime } from '../../services/format';

/** Checkout mô phỏng dùng đúng giao dịch server tạo; không nhập thẻ hoặc tự xác nhận đã trả tiền. */
export function PaymentPage({ manage = false }) {
  const { reference } = useParams();
  const { can } = useAuth();
  const base = (manage ? '/manage/payments/' : '/payments/') + encodeURIComponent(reference);
  const resource = useResource(base);
  const payment = resource.data;
  const [state, setState] = useState({});
  const [refunding, setRefunding] = useState(false);
  const canMockPay = !manage && payment?.mode === 'mock' && payment?.status === 'processing' && payment?.booking?.status === 'pending';
  const canRefund = manage && can('payments.write') && payment?.mode === 'mock' && payment?.status === 'success' && payment?.refunds?.some(refund => refund.status === 'requested') && !payment?.refunds?.some(refund => refund.status === 'success');

  /** Yêu cầu mô phỏng kết quả; chỉ hiển thị kết quả sau khi server xử lý webhook có chữ ký. */
  async function simulate(outcome) {
    setState({ saving: true });
    try { await api.post(base + '/simulate', { outcome }); setState({ success: 'Đã xử lý kết quả thử nghiệm. Trạng thái bên dưới được đọc lại từ server.' }); resource.reload(); }
    catch (error) { setState({ error: error.message }); resource.reload(); }
  }
  /** Xác nhận hoàn tiền trong sandbox; không đại diện việc chuyển tiền ngân hàng thật. */
  async function refund(event) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get('reason');
    setState({ saving: true });
    try { await api.post(base + '/refund', { reason }); setRefunding(false); setState({ success: 'Đã xử lý hoàn tiền thử nghiệm. Không có giao dịch ngân hàng thật.' }); resource.reload(); }
    catch (error) { setState({ error: error.message }); }
  }

  return <div className={manage ? '' : 'container narrow page-space'}><Link className="text-button" to={manage ? '/admin/payments' : payment?.booking_id ? '/bookings/' + payment.booking_id : '/bookings'}>← {manage ? 'Danh sách giao dịch' : 'Booking của tôi'}</Link><div className="page-heading"><h1>{manage ? 'Chi tiết giao dịch' : 'Thanh toán thử nghiệm'}</h1><button className="button small secondary" onClick={resource.reload}>Làm mới</button></div><Feedback {...state} /><RequestState resource={resource}>{payment && <><section className="panel"><div className="sandbox-label">MÔI TRƯỜNG THỬ NGHIỆM · KHÔNG THU TIỀN THẬT</div><h2>{payment.payment_reference}</h2><div className="payment-amount">{money(payment.amount)}</div><dl className="profile-details"><div><dt>Trạng thái giao dịch</dt><dd><span className={'badge ' + payment.status}>{paymentStatuses[payment.status] || payment.status}</span></dd></div><div><dt>Booking</dt><dd><Link className="text-button" to={(manage ? '/admin/bookings/' : '/bookings/') + payment.booking_id}>{payment.booking?.booking_code || payment.booking_id}</Link></dd></div><div><dt>Trạng thái booking</dt><dd>{bookingStatuses[payment.booking?.status] || 'Đang cập nhật'}</dd></div>{payment.paid_at && <div><dt>Thời điểm ghi nhận</dt><dd>{dateTime(payment.paid_at, true)}</dd></div>}</dl>{payment.status === 'success' && payment.booking?.status === 'confirmed' && <div className="notice success">Thanh toán thử nghiệm đã thành công và booking đã được xác nhận.</div>}{payment.status === 'success' && ['cancelled', 'expired'].includes(payment.booking?.status) && <div className="notice info">Giao dịch được ghi nhận thành công sau khi booking không còn giữ chỗ. Booking không được mở lại; vui lòng theo dõi yêu cầu hoàn tiền.</div>}{payment.status === 'failed' && <div className="notice error">Giao dịch thử nghiệm không thành công. Bạn có thể trở lại booking để tạo giao dịch khác khi còn hạn giữ chỗ.</div>}{payment.mode !== 'mock' && <div className="notice info">Chức năng mô phỏng đang tắt ở môi trường này.</div>}{canMockPay && <><p className="muted">Chọn kết quả để kiểm tra luồng thanh toán. Không nhập số thẻ, OTP hoặc thông tin ngân hàng.</p><div className="button-row"><button className="button" onClick={() => simulate('success')} disabled={state.saving}>Mô phỏng thành công</button><button className="button secondary" onClick={() => simulate('failed')} disabled={state.saving}>Mô phỏng thất bại</button></div></>}{canRefund && <button className="button secondary" disabled={state.saving} onClick={() => setRefunding(true)}>Xác nhận hoàn tiền thử nghiệm</button>}{refunding && canRefund && <form className="editor-form" onSubmit={refund}><h3>Hoàn tiền trong sandbox</h3><FormField label="Ghi chú hoàn tiền" name="reason" as="textarea" rows={3} maxLength={500} required /><label className="checkbox"><input type="checkbox" required /><span>Tôi xác nhận xử lý hoàn tiền mô phỏng, không chuyển tiền thật.</span></label><div className="button-row"><button className="button" disabled={state.saving}>Xác nhận hoàn tiền thử nghiệm</button><button className="text-button" type="button" onClick={() => setRefunding(false)}>Đóng</button></div></form>}</section>{payment.refunds?.length > 0 && <section className="panel"><h2>Trạng thái hoàn tiền</h2>{payment.refunds.map(refund => <div className="notice info" key={refund.id}><strong>{money(refund.amount)} · {refundStatuses[refund.status] || refund.status}</strong>{refund.reason && <p>{friendlyRefundReason(refund.reason)}</p>}<small>{refund.status === 'success' ? 'Kết quả mô phỏng; không có giao dịch ngân hàng thật.' : 'Yêu cầu đang được xử lý, chưa xác nhận đã hoàn tiền.'}</small></div>)}</section>}</>}</RequestState></div>;
}
