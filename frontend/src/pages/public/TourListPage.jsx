import { Link, useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource';
import { EmptyState, Pagination, RequestState } from '../../components/Feedback';
import { FormField } from '../../components/FormField';
import { money } from '../../services/format';
import { usePageMeta } from '../../hooks/usePageMeta';

/** Trang khám phá công khai; mọi thay đổi bộ lọc được lưu trong URL. */
export function TourListPage() {
  const [params, setParams] = useSearchParams();
  usePageMeta({ title: 'Khám phá hành trình | Hành Trình', description: 'Tìm tour, xem lịch khởi hành và số chỗ. Tự do khám phá trước khi đăng nhập đặt tour.', path: '/', index: !params.toString() });
  const categories = useResource('/categories');
  const query = new URLSearchParams(params);
  query.set('limit', '9');
  const tours = useResource('/tours?' + query);
  // Ghi bộ lọc vào URL, đồng thời quay về trang đầu của kết quả.
  function search(event) {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) if (String(value).trim()) next.set(key, String(value).trim());
    setParams(next);
  }
  // Chuyển trang nhưng giữ nguyên các điều kiện tìm kiếm.
  function goToPage(page) { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next); }
  return <>
    <section className="hero"><div className="hero-landscape" aria-hidden="true"><div className="sun" /><div className="mountain far" /><div className="mountain near" /><div className="sea" /></div><div className="container hero-content"><span className="eyebrow light">HÀNH TRÌNH MỚI ĐANG CHỜ BẠN</span><h1>Đi để khám phá.<br /><em>Về để nhớ mãi.</em></h1><p>Tìm chuyến đi phù hợp, xem lịch khởi hành và bắt đầu câu chuyện của riêng bạn.</p><a className="button coral" href="#tours">Khám phá hành trình <span aria-hidden="true">↗</span></a><div className="hero-caption"><span aria-hidden="true">◉</span> Du lịch trong nước & quốc tế</div></div></section>
    <div className="container tour-section" id="tours"><div className="section-heading"><div><span className="eyebrow">CHỌN ĐIỂM ĐẾN, CHỌN NIỀM VUI</span><h2>Hành trình dành cho bạn</h2></div><p>Tự do khám phá. Đăng nhập khi bạn sẵn sàng đặt tour.</p></div>
      <form className="search-panel" onSubmit={search} key={params.toString()}>
        <FormField label="Tìm hành trình" name="q" placeholder="Tên tour, từ khóa…" defaultValue={params.get('q') || ''} maxLength={200} />
        <FormField label="Điểm đến" name="destination" placeholder="Bạn muốn đi đâu?" defaultValue={params.get('destination') || ''} maxLength={255} />
        <FormField label="Danh mục" name="category_id" as="select" defaultValue={params.get('category_id') || ''}><option value="">Tất cả danh mục</option>{(categories.data || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</FormField>
        <FormField label="Loại tour" name="tour_type" as="select" defaultValue={params.get('tour_type') || ''}><option value="">Tất cả loại tour</option><option value="domestic">Trong nước</option><option value="international">Quốc tế</option></FormField>
        <FormField label="Giá từ (VND)" name="min_price" type="number" min="0" defaultValue={params.get('min_price') || ''} placeholder="Không giới hạn" />
        <FormField label="Giá đến (VND)" name="max_price" type="number" min="0" defaultValue={params.get('max_price') || ''} placeholder="Không giới hạn" />
        <FormField label="Khởi hành từ" name="departure_from" type="date" defaultValue={params.get('departure_from') || ''} />
        <FormField label="Khởi hành đến" name="departure_to" type="date" defaultValue={params.get('departure_to') || ''} />
        <div className="filter-actions"><button className="button" type="submit">Tìm tour <span aria-hidden="true">→</span></button><button className="text-button" type="button" onClick={() => setParams({})}>Xóa bộ lọc</button></div>
      </form>
      <RequestState resource={tours}><div className="results-heading"><p><strong>{tours.meta?.total || 0}</strong> hành trình phù hợp</p><span className="muted">Lịch khởi hành & giá được cập nhật từ hệ thống</span></div>{tours.data?.length ? <div className="tour-grid">{tours.data.map(tour => <TourCard key={tour.id} tour={tour} />)}</div> : <EmptyState title="Chưa tìm thấy hành trình phù hợp">Hãy thử điểm đến khác hoặc điều chỉnh bộ lọc. Các tour đang mở sẽ xuất hiện tại đây.</EmptyState>}<Pagination meta={tours.meta} onChange={goToPage} /></RequestState>
    </div>
    <section className="promise-strip"><div className="container promise-grid"><div><span>01</span><strong>Chọn hành trình</strong><p>Tìm tour theo điểm đến và ngân sách.</p></div><div><span>02</span><strong>Xem lịch khởi hành</strong><p>Chọn ngày đi và xem số chỗ còn lại.</p></div><div><span>03</span><strong>Sẵn sàng lên đường</strong><p>Đăng nhập để bắt đầu đặt tour.</p></div></div></section>
  </>;
}

/** Thẻ tour lấy trực tiếp từ API, dùng khung minh họa khi chưa có ảnh. */
function TourCard({ tour }) {
  return <article className="tour-card"><Link className="tour-photo" to={`/tours/${encodeURIComponent(tour.slug || tour.id)}`} tabIndex={-1} aria-hidden="true">{tour.featured_image_url ? <img src={tour.featured_image_url} alt="" loading="lazy" /> : <div className="photo-placeholder"><span>✦</span><small>HÀNH TRÌNH MỚI</small></div>}<span className="photo-tag">{tour.tour_type === 'international' ? 'Quốc tế' : 'Trong nước'}</span></Link><div className="tour-card-body"><p className="tour-location">⌖ {tour.destination || tour.category_name || 'Khám phá điểm đến'}</p><h3><Link to={`/tours/${encodeURIComponent(tour.slug || tour.id)}`}>{tour.title}</Link></h3><p className="tour-duration">◷ {tour.duration_days} ngày · {tour.duration_nights} đêm{tour.departure_location ? ` · Từ ${tour.departure_location}` : ''}</p><div className="tour-card-bottom"><div><small>Giá người lớn từ</small><strong>{money(tour.base_price)}</strong></div><Link className="round-link" to={`/tours/${encodeURIComponent(tour.slug || tour.id)}`} aria-label={`Xem tour ${tour.title}`}>↗</Link></div></div></article>;
}
