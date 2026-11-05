import { Link, useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource';
import { useAuth } from '../../hooks/useAuth';
import { EmptyState, Pagination, RequestState } from '../../components/Feedback';
import { money, statusLabels } from '../../services/format';

/** Danh sách quản trị gồm bản nháp/đã ẩn; API này luôn yêu cầu quyền đọc tour. */
export function ToursPage() {
  const [params, setParams] = useSearchParams();
  const resource = useResource('/manage/tours?' + params);
  const { can } = useAuth();
  function search(event) { event.preventDefault(); const values = new FormData(event.currentTarget); const next = new URLSearchParams(); for (const [key, value] of values) if (value) next.set(key, value); setParams(next); }
  function page(value) { const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next); }
  return <><div className="page-heading"><div><span className="eyebrow">NỘI DUNG WEBSITE</span><h1>Quản lý tour</h1></div>{can('tours.write') && <Link className="button" to="/admin/tours/new">+ Thêm tour</Link>}</div><form className="toolbar" onSubmit={search} key={params.toString()}><label><span className="sr-only">Tìm tour</span><input name="q" placeholder="Tìm theo tên tour…" defaultValue={params.get('q') || ''} /></label><label><span className="sr-only">Trạng thái tour</span><select name="status" defaultValue={params.get('status') || ''}><option value="">Tất cả trạng thái</option><option value="draft">Bản nháp</option><option value="active">Đang hiển thị</option><option value="hidden">Đã ẩn</option></select></label><button className="button secondary">Tìm kiếm</button></form><RequestState resource={resource}>{resource.data?.length ? <div className="table-wrap"><table><thead><tr><th>Tên hành trình</th><th>Thời gian</th><th>Giá người lớn</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{resource.data.map(tour => <tr key={tour.id}><td><strong>{tour.title}</strong><small>{tour.destination || tour.category_name}</small></td><td>{tour.duration_days}N{tour.duration_nights}Đ</td><td>{money(tour.base_price)}</td><td><span className={'badge ' + tour.status}>{statusLabels[tour.status]}</span></td><td><Link className="text-button" to={`/admin/tours/${tour.id}`}>{can('tours.write') ? 'Chỉnh sửa' : 'Chi tiết'} →</Link></td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có tour phù hợp">Thêm hành trình mới hoặc điều chỉnh bộ lọc.</EmptyState>}<Pagination meta={resource.meta} onChange={page} /></RequestState></>;
}
