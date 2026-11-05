/** Thông báo dùng vùng live để người dùng trình đọc màn hình nhận được kết quả. */
export function Feedback({ error, success }) {
  return <>{error && <div className="notice error" role="alert">{error}</div>}{success && <div className="notice success" role="status">{success}</div>}</>;
}

/** Trạng thái tải/lỗi tái sử dụng cho danh sách và chi tiết lấy từ API. */
export function RequestState({ resource, children }) {
  if (resource.loading) return <div className="state" role="status"><span className="spinner" /> Đang tải dữ liệu…</div>;
  if (resource.error) return <div className="state"><Feedback error={resource.error} /><button className="button secondary" onClick={resource.reload}>Thử lại</button></div>;
  return children;
}

export function EmptyState({ title = 'Chưa có dữ liệu', children }) {
  return <div className="empty-state"><span aria-hidden="true">◈</span><h3>{title}</h3><p>{children}</p></div>;
}

export function Pagination({ meta, onChange }) {
  if (!meta || Number(meta.totalPages) <= 1) return null;
  return <nav className="pagination" aria-label="Phân trang"><button className="button secondary" disabled={Number(meta.page) <= 1} onClick={() => onChange(Number(meta.page) - 1)}>← Trang trước</button><span>Trang {meta.page} / {meta.totalPages}</span><button className="button secondary" disabled={Number(meta.page) >= Number(meta.totalPages)} onClick={() => onChange(Number(meta.page) + 1)}>Trang sau →</button></nav>;
}
