import { useState } from 'react';
import { api } from '../../services/api';
import { Feedback, EmptyState } from '../../components/Feedback';
import { FormField } from '../../components/FormField';

/** Thêm/sửa từng ảnh và từng ngày lịch trình, bảo toàn các bản ghi khác. */
export function TourMediaEditor({ tour, reload, writable }) {
  const [image, setImage] = useState(null);
  const [day, setDay] = useState(null);
  const [state, setState] = useState({});
  // Lưu một ảnh, giữ nguyên các ảnh khác và để backend bảo đảm ảnh đại diện.
  async function saveImage(event) {
    event.preventDefault(); const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form)); body.sort_order = Number(body.sort_order); body.is_featured = body.is_featured === 'on';
    setState({ saving: true });
    try { const url = `/manage/tours/${tour.id}/images`; await (image ? api.patch(url + '/' + image.id, body) : api.post(url, body)); setImage(null); form.reset(); reload(); setState({ success: 'Đã lưu hình ảnh.' }); }
    catch (error) { setState({ error: error.message }); }
  }
  // Lưu nội dung một ngày lịch trình; backend kiểm tra ngày và tour liên quan.
  async function saveDay(event) {
    event.preventDefault(); const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form)); body.day_number = Number(body.day_number);
    setState({ saving: true });
    try { const url = `/manage/tours/${tour.id}/itineraries`; await (day ? api.patch(url + '/' + day.id, body) : api.post(url, body)); setDay(null); form.reset(); reload(); setState({ success: 'Đã lưu ngày lịch trình.' }); }
    catch (error) { setState({ error: error.message }); }
  }
  return <><Feedback {...state} /><section className="panel"><h2>Hình ảnh tour</h2><div className="image-admin-grid">{(tour.images || []).map(item => <article key={item.id}><img src={item.image_url} alt={item.alt_text || 'Ảnh tour'} /><span>{item.is_featured ? 'Ảnh đại diện · ' : ''}Thứ tự {item.sort_order}</span>{writable && <button className="text-button" onClick={() => setImage(item)}>Chỉnh sửa</button>}</article>)}</div>{!tour.images?.length && <EmptyState title="Chưa có hình ảnh">Thêm đường dẫn ảnh để giới thiệu hành trình.</EmptyState>}{writable && <form onSubmit={saveImage} key={image?.id || 'new-image'} className="editor-form"><h3>{image ? 'Chỉnh sửa ảnh' : 'Thêm ảnh'}</h3><FormField label="Đường dẫn hình ảnh" name="image_url" defaultValue={image?.image_url || ''} maxLength={1024} placeholder="https://… hoặc /images/…" required /><div className="form-grid"><FormField label="Mô tả ảnh" name="alt_text" defaultValue={image?.alt_text || ''} maxLength={255} /><FormField label="Thứ tự hiển thị" name="sort_order" type="number" min="0" defaultValue={image?.sort_order || 0} /></div><label className="checkbox"><input name="is_featured" type="checkbox" defaultChecked={Boolean(image?.is_featured)} />Đặt làm ảnh đại diện</label><div className="button-row"><button className="button small" disabled={state.saving}>Lưu hình ảnh</button>{image && <button className="text-button" type="button" onClick={() => setImage(null)}>Hủy chỉnh sửa</button>}</div></form>}</section><section className="panel"><h2>Lịch trình theo ngày</h2>{tour.itineraries?.length ? <div className="item-list">{tour.itineraries.map(item => <article key={item.id}><div><strong>Ngày {item.day_number}: {item.title}</strong><p className="prose">{item.content}</p></div>{writable && <button className="button small secondary" onClick={() => setDay(item)}>Chỉnh sửa</button>}</article>)}</div> : <EmptyState title="Chưa có lịch trình">Thêm nội dung khám phá cho từng ngày.</EmptyState>}{writable && <form onSubmit={saveDay} key={day?.id || 'new-day'} className="editor-form"><h3>{day ? 'Chỉnh sửa ngày lịch trình' : 'Thêm ngày lịch trình'}</h3><div className="form-grid"><FormField label="Ngày thứ" name="day_number" type="number" min="1" max={tour.duration_days || 65535} defaultValue={day?.day_number || 1} required /><FormField label="Tiêu đề" name="title" maxLength={255} defaultValue={day?.title || ''} required /></div><FormField label="Nội dung" name="content" as="textarea" rows={5} defaultValue={day?.content || ''} required /><div className="button-row"><button className="button small" disabled={state.saving}>Lưu lịch trình</button>{day && <button className="text-button" type="button" onClick={() => setDay(null)}>Hủy chỉnh sửa</button>}</div></form>}</section></>;
}
