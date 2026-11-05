import { useState } from 'react';
import { api } from '../../services/api';
import { Feedback, EmptyState } from '../../components/Feedback';
import { FormField } from '../../components/FormField';
import { dateTime, statusLabels } from '../../services/format';

/** Chuyển chuỗi DATETIME của MySQL sang giá trị input, giữ giờ địa phương. */
function localInput(value) { return value ? String(value).replace(' ', 'T').slice(0, 16) : ''; }

/** Cấu hình lịch khởi hành cơ bản; số chỗ đã đặt do nghiệp vụ booking quản lý. */
export function ScheduleEditor({ tour, reload, writable }) {
  const [editing, setEditing] = useState(null);
  const [state, setState] = useState({});
  // Giá riêng rỗng trở thành null; booked_seats không bao giờ được gửi từ form.
  async function submit(event) {
    event.preventDefault(); const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form)); body.max_capacity = Number(body.max_capacity);
    for (const key of ['adult_price_override', 'child_price_override', 'infant_price_override']) body[key] = body[key] === '' ? null : Number(body[key]);
    for (const key of ['return_date', 'meeting_time']) if (!body[key]) body[key] = null;
    setState({ saving: true });
    try { const url = `/manage/tours/${tour.id}/schedules`; await (editing ? api.patch(url + '/' + editing.id, body) : api.post(url, body)); setEditing(null); form.reset(); reload(); setState({ success: 'Đã lưu lịch khởi hành.' }); }
    catch (error) { setState({ error: error.message }); }
  }
  return <section className="panel"><h2>Lịch khởi hành</h2><p className="muted">Không điều chỉnh số chỗ đã đặt ở đây. Để trống giá riêng để dùng giá mặc định của tour.</p><Feedback {...state} />{tour.schedules?.length ? <div className="table-wrap"><table><thead><tr><th>Khởi hành</th><th>Chỗ đã đặt / tối đa</th><th>Trạng thái</th><th /></tr></thead><tbody>{tour.schedules.map(schedule => <tr key={schedule.id}><td>{dateTime(schedule.departure_date, true)}</td><td>{schedule.booked_seats} / {schedule.max_capacity}</td><td><span className={'badge ' + schedule.status}>{statusLabels[schedule.status]}</span></td><td>{writable && <button className="text-button" onClick={() => setEditing(schedule)}>Chỉnh sửa</button>}</td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có lịch khởi hành">Tạo lịch để khách có thể chọn ngày đi.</EmptyState>}{writable && <form className="editor-form" onSubmit={submit} key={editing?.id || 'new-schedule'}><h3>{editing ? 'Chỉnh sửa lịch khởi hành' : 'Thêm lịch khởi hành'}</h3><div className="form-grid"><FormField label="Ngày giờ khởi hành" name="departure_date" type="datetime-local" defaultValue={localInput(editing?.departure_date)} required /><FormField label="Ngày giờ trở về" name="return_date" type="datetime-local" defaultValue={localInput(editing?.return_date)} /><FormField label="Số chỗ tối đa" name="max_capacity" type="number" min={Math.max(Number(editing?.booked_seats || 0), 1)} defaultValue={editing?.max_capacity || 20} required /><FormField label="Trạng thái" name="status" as="select" defaultValue={editing?.status || 'open'}><option value="open">Mở đăng ký</option><option value="closed">Đã đóng</option><option value="cancelled">Đã hủy</option></FormField><FormField label="Điểm tập trung" name="meeting_point" defaultValue={editing?.meeting_point || ''} maxLength={255} /><FormField label="Giờ tập trung" name="meeting_time" type="datetime-local" defaultValue={localInput(editing?.meeting_time)} />{[['Giá người lớn riêng', 'adult_price_override'], ['Giá trẻ em riêng', 'child_price_override'], ['Giá em bé riêng', 'infant_price_override']].map(([label, key]) => <FormField label={label + ' (VND)'} name={key} type="number" key={key} min="0" step="0.01" defaultValue={editing?.[key] ?? ''} placeholder="Dùng giá mặc định" />)}</div><div className="button-row"><button className="button small" disabled={state.saving}>Lưu lịch khởi hành</button>{editing && <button className="text-button" type="button" onClick={() => setEditing(null)}>Hủy chỉnh sửa</button>}</div></form>}</section>;
}
