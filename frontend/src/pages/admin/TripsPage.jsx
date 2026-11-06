import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useResource } from '../../hooks/useResource';
import { api } from '../../services/api';
import { Feedback, EmptyState, RequestState, Pagination } from '../../components/Feedback';
import { FormField } from '../../components/FormField';
import { dateTime, statusLabels } from '../../services/format';

/** Danh sách điều hành dùng lịch khởi hành hiện hữu, hiển thị phân công thực tế. */
export function TripsPage() {
  const [params, setParams] = useSearchParams();
  const resource = useResource('/manage/trips?' + params);
  function search(event) { event.preventDefault(); setParams(Object.fromEntries([...new FormData(event.currentTarget)].filter(([,value]) => value))); }
  return <><h1>Điều hành chuyến đi</h1><form className="toolbar" onSubmit={search}><label><span className="sr-only">Tìm chuyến đi</span><input name="q" placeholder="Tên tour, điểm tập trung…" defaultValue={params.get('q') || ''} /></label><select name="status" aria-label="Trạng thái" defaultValue={params.get('status') || ''}><option value="">Mọi trạng thái</option><option value="open">Mở</option><option value="closed">Đóng</option><option value="cancelled">Đã hủy</option></select><button className="button secondary">Tìm kiếm</button></form><RequestState resource={resource}>{resource.data?.length ? <div className="table-wrap"><table><thead><tr><th>Hành trình</th><th>Khởi hành</th><th>Chỗ đã giữ</th><th>Hướng dẫn viên</th><th>Trạng thái</th><th /></tr></thead><tbody>{resource.data.map(trip => <tr key={trip.id}><td><strong>{trip.tour_title}</strong><small>{trip.meeting_point}</small></td><td>{dateTime(trip.departure_date, true)}</td><td>{trip.booked_seats} / {trip.max_capacity}</td><td>{trip.guide_count}</td><td><span className={'badge ' + trip.status}>{statusLabels[trip.status]}</span></td><td><Link className="text-button" to={'/admin/trips/' + trip.id}>Điều hành →</Link></td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có chuyến phù hợp">Tạo lịch khởi hành trong chi tiết tour trước khi phân công.</EmptyState>}<Pagination meta={resource.meta} onChange={page => { const next = new URLSearchParams(params); next.set('page', page); setParams(next); }} /></RequestState></>;
}

/** Thông tin vận hành, phân công chống trùng lịch và manifest theo quyền. */
export function TripDetailPage() {
  const { id } = useParams(), { can } = useAuth();
  const resource = useResource('/manage/trips/' + id);
  const guides = useResource(can('guides.read') ? '/manage/guides?status=active&limit=100' : null);
  const trip = resource.data;
  const [state, setState] = useState({}), [finishing, setFinishing] = useState(false);
  /** Chỉ gửi thông tin chuyến; không nhận giá, sức chứa hoặc số chỗ ở biểu mẫu này. */
  async function save(event) {
    event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); if (!body.meeting_time) body.meeting_time = null; setState({ saving: true });
    try { await api.patch('/manage/trips/' + id, body); resource.reload(); setState({ success: 'Đã lưu thông tin và tạo thông báo cho các khách đã xác nhận.' }); }
    catch (error) { setState({ error: error.message }); }
  }
  /** Phân công một guide; backend kiểm tra khoảng thời gian và guide đang hoạt động. */
  async function assign(event) {
    event.preventDefault(); const form = event.currentTarget, body = Object.fromEntries(new FormData(form)); body.is_lead = body.is_lead === 'on'; setState({ saving: true });
    try { await api.post('/manage/trips/' + id + '/guides', body); form.reset(); resource.reload(); setState({ success: 'Đã cập nhật phân công.' }); }
    catch (error) { setState({ error: error.message }); }
  }
  /** Gỡ đúng quan hệ phân công, giữ nguyên hồ sơ hướng dẫn viên. */
  async function remove(guideId) { setState({ saving: true }); try { await api.delete(`/manage/trips/${id}/guides/${guideId}`); resource.reload(); setState({ success: 'Đã gỡ phân công.' }); } catch (error) { setState({ error: error.message }); } }
  /** Xác nhận sau chuyến, chỉ server quyết định thời điểm hợp lệ và chuyển booking hoàn thành. */
  async function complete(event) {
    event.preventDefault(); setState({ saving: true });
    try { const result = await api.post('/manage/trips/' + id + '/complete', {}); resource.reload(); setFinishing(false); setState({ success: `Đã hoàn thành ${result.data.completed} booking của chuyến đi.` }); }
    catch (error) { setState({ error: error.message }); }
  }
  return <><Link className="text-button" to="/admin/trips">← Danh sách chuyến đi</Link><h1>Thông tin điều hành</h1><Feedback {...state} /><RequestState resource={resource}>{trip && <><section className="panel"><h2>{trip.tour_title}</h2><p>{dateTime(trip.departure_date, true)} → {dateTime(trip.return_date, true)} · {trip.booked_seats}/{trip.max_capacity} chỗ</p><form onSubmit={save} key={trip.updated_at || trip.id}><fieldset disabled={!can('trips.write') || state.saving}><div className="form-grid"><FormField label="Điểm tập trung" name="meeting_point" maxLength={255} defaultValue={trip.meeting_point || ''} /><FormField label="Giờ tập trung" name="meeting_time" type="datetime-local" defaultValue={trip.meeting_time?.replace(' ', 'T').slice(0, 16) || ''} /><FormField label="Liên hệ khẩn cấp" name="emergency_phone" maxLength={25} defaultValue={trip.emergency_phone || ''} /></div>{[['Thông tin di chuyển','transport_info'],['Thông tin lưu trú','accommodation_info'],['Hướng dẫn dành cho khách','customer_instructions'],['Ghi chú nội bộ (không hiển thị khách)','notes']].map(([label,key]) => <FormField label={label} key={key} name={key} as="textarea" rows={3} maxLength={15000} defaultValue={trip[key] || ''} />)}{can('trips.write') && <button className="button" disabled={state.saving}>Lưu thông tin chuyến đi</button>}</fieldset></form></section><section className="panel"><h2>Phân công hướng dẫn viên</h2>{trip.guides?.length ? trip.guides.map(guide => <div className="ranking-row" key={guide.id}><div><strong>{guide.full_name}</strong><p>{guide.is_lead ? 'Trưởng đoàn · ' : ''}{guide.phone} · {guide.languages}</p></div>{can('trips.write') && <button className="text-button" disabled={state.saving} onClick={() => remove(guide.id)}>Gỡ phân công</button>}</div>) : <p className="muted">Chưa có hướng dẫn viên được phân công.</p>}{can('trips.write') && can('guides.read') && <RequestState resource={guides}><form onSubmit={assign} className="editor-form"><FormField label="Hướng dẫn viên hoạt động" name="guide_id" as="select" required defaultValue=""><option value="" disabled>Chọn hướng dẫn viên</option>{guides.data?.map(guide => <option key={guide.id} value={guide.id}>{guide.full_name} · {guide.languages || guide.phone}</option>)}</FormField><label className="checkbox"><input name="is_lead" type="checkbox" />Trưởng đoàn</label><button className="button small" disabled={state.saving}>Lưu phân công</button><p className="muted">Hệ thống sẽ từ chối nếu lịch phân công trùng một chuyến khác.</p></form></RequestState>}</section>{can('bookings.read') && <section className="panel"><h2>Danh sách khách đã xác nhận/hoàn thành</h2>{trip.manifest?.length ? <div className="table-wrap"><table><thead><tr><th>Booking</th><th>Hành khách</th><th>Loại</th><th>Liên hệ đoàn</th></tr></thead><tbody>{trip.manifest.map(passenger => <tr key={passenger.id}><td><Link className="text-button" to={'/admin/bookings/' + passenger.booking_id}>{passenger.booking_code}</Link></td><td>{passenger.full_name}</td><td>{{ adult: 'Người lớn', child: 'Trẻ em', infant: 'Em bé' }[passenger.passenger_type]}</td><td>{passenger.contact_name}<small>{passenger.contact_phone}</small></td></tr>)}</tbody></table></div> : <p className="muted">Chưa có khách đã xác nhận.</p>}</section>}{can('trips.write') && can('bookings.write') && <section className="panel"><h2>Kết thúc chuyến đi</h2><p className="muted">Chỉ hoàn thành sau ngày giờ kết thúc. Booking đã xác nhận sẽ chuyển sang hoàn thành và khách được mở điều kiện đánh giá.</p>{!finishing ? <button className="button secondary" onClick={() => setFinishing(true)}>Xác nhận hoàn thành chuyến</button> : <form onSubmit={complete}><label className="checkbox"><input required type="checkbox" />Tôi đã kiểm tra chuyến đi thực sự kết thúc và danh sách booking.</label><div className="button-row"><button className="button" disabled={state.saving}>Hoàn thành các booking</button><button className="text-button" type="button" onClick={() => setFinishing(false)}>Đóng</button></div></form>}</section>}</>}</RequestState></>;
}
