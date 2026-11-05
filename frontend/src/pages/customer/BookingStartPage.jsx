import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import { RequestState, Feedback } from '../../components/Feedback';
import { FormField } from '../../components/FormField';
import { dateTime, money } from '../../services/format';
import { bookingPayload, passengerLabels, quoteBooking } from '../../services/booking';

/** Thu thập hành khách/liên hệ; backend chốt giá và giữ chỗ trong transaction. */
export function BookingStartPage() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const tourId = params.get('tour');
  const resource = useResource(tourId && /^\d+$/.test(tourId) ? '/tours/' + tourId : null);
  const tour = resource.data;
  const schedule = tour?.schedules?.find(item => String(item.id) === params.get('schedule'));
  const idempotencyKey = useRef(null);
  if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
  const [passengers, setPassengers] = useState(() => [{ key: crypto.randomUUID(), full_name: user.full_name || '', passenger_type: 'adult' }]);
  const [state, setState] = useState({});
  const quote = useMemo(() => { try { return schedule ? quoteBooking(passengers, schedule) : null; } catch { return null; } }, [passengers, schedule]);
  const unavailable = !schedule || !quote || quote.seats > Number(schedule.available_seats) || Number(schedule.available_seats) <= 0;
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

  /** Cập nhật một hành khách nhưng không tạo trường giá/chiếm chỗ gửi tới API. */
  function updatePassenger(key, field, value) {
    setPassengers(current => current.map(row => row.key === key ? { ...row, [field]: value } : row));
  }
  function addPassenger() { setPassengers(current => [...current, { key: crypto.randomUUID(), full_name: '', passenger_type: 'adult' }]); }
  function removePassenger(key) { setPassengers(current => current.filter(row => row.key !== key)); }

  /** Giữ nguyên Idempotency-Key khi thử lại, tránh tạo trùng đơn do nhấn lại hoặc mạng gián đoạn. */
  async function submit(event) {
    event.preventDefault();
    if (state.saving || unavailable) return;
    try {
      const payload = bookingPayload(Object.fromEntries(new FormData(event.currentTarget)), passengers, schedule.id);
      setState({ saving: true });
      const result = await api.post('/bookings', payload, { headers: { 'Idempotency-Key': idempotencyKey.current } });
      navigate('/bookings/' + result.data.id, { replace: true });
    } catch (error) { setState({ error: error.message || 'Không thể tạo booking. Hãy kiểm tra danh sách đơn trước khi gửi lại.' }); }
  }

  return <div className="container page-space"><span className="eyebrow">ĐẶT HÀNH TRÌNH CỦA BẠN</span><h1>Thông tin đặt tour</h1><RequestState resource={resource}>{tour && schedule ? <div className="booking-form-layout"><form onSubmit={submit}><Feedback error={state.error} /><fieldset disabled={state.saving}><section className="panel"><h2>Thông tin liên hệ</h2><div className="form-grid"><FormField label="Họ và tên liên hệ" name="contact_name" defaultValue={user.full_name || ''} autoComplete="name" maxLength={150} required /><FormField label="Email" name="contact_email" type="email" defaultValue={user.email || ''} autoComplete="email" maxLength={255} required /><FormField label="Số điện thoại" name="contact_phone" type="tel" defaultValue={user.phone || ''} autoComplete="tel" maxLength={25} required /></div><FormField label="Ghi chú cho công ty" name="customer_note" as="textarea" rows={3} maxLength={2000} /></section><section className="panel"><div className="page-heading"><h2>Hành khách ({passengers.length}/30)</h2><button className="button small secondary" type="button" disabled={passengers.length >= 30} onClick={addPassenger}>+ Thêm hành khách</button></div><p className="muted">Cần ít nhất một người lớn. Người lớn và trẻ em mỗi người sử dụng một chỗ; em bé không chiếm chỗ riêng.</p>{passengers.map((passenger, index) => <article className="passenger-editor" key={passenger.key}><div className="passenger-heading"><h3>Hành khách {index + 1}</h3>{passengers.length > 1 && <button className="text-button" type="button" onClick={() => removePassenger(passenger.key)} aria-label={'Bỏ hành khách ' + (index + 1)}>Bỏ hành khách</button>}</div><div className="form-grid"><FormField label="Họ và tên" name={'passenger-name-' + index} value={passenger.full_name} onChange={event => updatePassenger(passenger.key, 'full_name', event.target.value)} maxLength={150} required /><FormField label="Loại hành khách" name={'passenger-type-' + index} as="select" value={passenger.passenger_type} onChange={event => updatePassenger(passenger.key, 'passenger_type', event.target.value)}>{Object.entries(passengerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</FormField><FormField label="Ngày sinh (tùy chọn)" name={'passenger-dob-' + index} type="date" max={today} value={passenger.date_of_birth || ''} onChange={event => updatePassenger(passenger.key, 'date_of_birth', event.target.value)} /><FormField label="Giới tính (tùy chọn)" name={'passenger-gender-' + index} as="select" value={passenger.gender || ''} onChange={event => updatePassenger(passenger.key, 'gender', event.target.value)}><option value="">Chưa cung cấp</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option></FormField><FormField label="Loại giấy tờ (tùy chọn)" name={'passenger-document-type-' + index} as="select" value={passenger.document_type || ''} onChange={event => updatePassenger(passenger.key, 'document_type', event.target.value)}><option value="">Chưa cung cấp</option><option value="id_card">CCCD/CMND</option><option value="passport">Hộ chiếu</option></FormField><FormField label="Số giấy tờ (tùy chọn)" name={'passenger-document-' + index} value={passenger.document_number || ''} onChange={event => updatePassenger(passenger.key, 'document_number', event.target.value)} maxLength={100} /></div></article>)}</section><section className="panel"><label className="checkbox booking-consent"><input type="checkbox" name="accept" required /><span>Tôi đã kiểm tra thông tin liên hệ, hành khách và chính sách của tour. Giá và số chỗ được hệ thống kiểm tra lại khi tạo booking.</span></label>{unavailable && <div className="notice error">Số chỗ hiện tại không đủ hoặc lịch đã hết chỗ. Vui lòng chọn lịch khác hoặc giảm số hành khách sử dụng chỗ.</div>}<button className="button" disabled={state.saving || unavailable}>{state.saving ? 'Đang kiểm tra và giữ chỗ…' : 'Tạo booking & giữ chỗ'}</button><p className="muted booking-small">Nếu mạng gián đoạn, giữ trang này để gửi lại an toàn hoặc kiểm tra <Link to="/bookings">Booking của tôi</Link>.</p></section></fieldset></form><aside className="booking-order-summary panel"><span className="eyebrow">HÀNH TRÌNH ĐÃ CHỌN</span><h2>{tour.title}</h2><dl className="profile-details"><div><dt>Khởi hành</dt><dd>{dateTime(schedule.departure_date, true)}</dd></div><div><dt>Chỗ hiện còn</dt><dd>{schedule.available_seats}</dd></div><div><dt>Số chỗ dự kiến dùng</dt><dd>{quote?.seats ?? '—'}</dd></div></dl><dl className="price-breakdown"><div><dt>Người lớn</dt><dd>{money(schedule.adult_price)}</dd></div><div><dt>Trẻ em</dt><dd>{money(schedule.child_price)}</dd></div><div><dt>Em bé</dt><dd>{money(schedule.infant_price)}</dd></div></dl><div className="booking-estimate"><span>Tạm tính</span><strong>{money(quote?.total)}</strong></div><p className="booking-small muted">Giá chính thức do server chốt tại lúc tạo booking; việc chọn lịch chưa giữ chỗ.</p>{tour.cancellation_policy && <details className="booking-policy"><summary>Chính sách hủy tour</summary><p className="prose">{tour.cancellation_policy}</p></details>}<Link className="text-button" to={'/tours/' + encodeURIComponent(tour.slug || tour.id)}>← Chọn lại lịch khởi hành</Link></aside></div> : <div className="panel"><h2>Lựa chọn không còn khả dụng</h2><p>Lịch khởi hành có thể đã thay đổi. Vui lòng chọn lại tour.</p><Link className="button" to="/">Khám phá tour</Link></div>}</RequestState></div>;
}