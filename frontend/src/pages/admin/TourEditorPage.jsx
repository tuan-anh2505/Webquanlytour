import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useResource } from '../../hooks/useResource';
import { api } from '../../services/api';
import { Feedback, RequestState } from '../../components/Feedback';
import { FormField } from '../../components/FormField';
import { TourMediaEditor } from './TourMediaEditor';
import { ScheduleEditor } from './ScheduleEditor';

/** Biên tập tour trên các bảng có sẵn; thay đổi trạng thái để ẩn thay vì xóa. */
export function TourEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const resource = useResource(isNew ? null : '/manage/tours/' + id);
  const categories = useResource('/categories');
  const { can } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState({});
  const tour = resource.data || {};
  // Chuẩn hóa form rồi lưu qua API có kiểm tra quyền và ràng buộc dữ liệu.
  async function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    for (const key of ['base_price', 'child_price', 'infant_price', 'duration_days', 'duration_nights']) body[key] = Number(body[key]);
    body.category_id = body.category_id || null;
    if (!body.slug) delete body.slug;
    setState({ saving: true });
    try { const result = await (isNew ? api.post('/manage/tours', body) : api.patch('/manage/tours/' + id, body)); setState({ success: 'Đã lưu thông tin tour.' }); if (isNew) navigate('/admin/tours/' + result.data.id, { replace: true }); else resource.reload(); }
    catch (error) { setState({ error: error.message }); }
  }
  return <><Link className="text-button" to="/admin/tours">← Danh sách tour</Link><div className="page-heading"><h1>{isNew ? 'Thêm hành trình mới' : 'Thông tin hành trình'}</h1>{tour.status === 'active' && <Link className="button small secondary" to={'/tours/' + tour.slug} target="_blank" rel="noreferrer">Xem trang công khai ↗</Link>}</div><Feedback {...state} /><RequestState resource={resource}>{(!isNew || can('tours.write')) && <>
    <section className="panel"><form onSubmit={submit} key={tour.id || 'new'}><fieldset disabled={!can('tours.write') || state.saving}><legend>Thông tin cơ bản</legend><div className="form-grid"><FormField label="Tên tour" name="title" defaultValue={tour.title || ''} maxLength={255} required /><FormField label="Đường dẫn (slug)" name="slug" defaultValue={tour.slug || ''} maxLength={255} placeholder="Tự tạo nếu để trống" /><FormField label="Danh mục" name="category_id" as="select" defaultValue={tour.category_id || ''}><option value="">Chưa phân loại</option>{(categories.data || []).map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</FormField><FormField label="Loại tour" name="tour_type" as="select" defaultValue={tour.tour_type || 'domestic'}><option value="domestic">Trong nước</option><option value="international">Quốc tế</option></FormField><FormField label="Điểm khởi hành" name="departure_location" defaultValue={tour.departure_location || ''} maxLength={200} /><FormField label="Điểm đến" name="destination" defaultValue={tour.destination || ''} maxLength={255} /><FormField label="Số ngày" name="duration_days" type="number" min="1" max="65535" defaultValue={tour.duration_days || 1} required /><FormField label="Số đêm" name="duration_nights" type="number" min="0" max="65535" defaultValue={tour.duration_nights || 0} required /><FormField label="Giá người lớn (VND)" name="base_price" type="number" min="0" step="0.01" defaultValue={tour.base_price || 0} required /><FormField label="Giá trẻ em (VND)" name="child_price" type="number" min="0" step="0.01" defaultValue={tour.child_price || 0} required /><FormField label="Giá em bé (VND)" name="infant_price" type="number" min="0" step="0.01" defaultValue={tour.infant_price || 0} required /><FormField label="Trạng thái" name="status" as="select" defaultValue={tour.status || 'draft'}><option value="draft">Bản nháp</option><option value="active">Đang hiển thị</option><option value="hidden">Đã ẩn</option></FormField></div><FormField label="Tóm tắt" name="summary" as="textarea" rows={2} maxLength={500} defaultValue={tour.summary || ''} />{[['Mô tả chi tiết', 'description'], ['Điểm nổi bật', 'highlights'], ['Dịch vụ bao gồm', 'included_services'], ['Dịch vụ không bao gồm', 'excluded_services'], ['Chính sách hủy', 'cancellation_policy']].map(([label, key]) => <FormField key={key} label={label} name={key} as="textarea" rows={4} defaultValue={tour[key] || ''} />)}<div className="form-grid"><FormField label="Tiêu đề SEO" name="meta_title" defaultValue={tour.meta_title || ''} maxLength={255} /><FormField label="Mô tả SEO" name="meta_description" defaultValue={tour.meta_description || ''} maxLength={500} /></div>{can('tours.write') && <button className="button" disabled={state.saving}>{state.saving ? 'Đang lưu…' : isNew ? 'Tạo tour' : 'Lưu thông tin tour'}</button>}</fieldset></form></section>
    {!isNew && <><TourMediaEditor tour={tour} reload={resource.reload} writable={can('tours.write')} />{can('schedules.read') && <ScheduleEditor tour={tour} reload={resource.reload} writable={can('schedules.write')} />}</>}
    </>}</RequestState>{isNew && !can('tours.write') && <div className="notice error">Bạn chưa được cấp quyền tạo tour.</div>}</>;
}
