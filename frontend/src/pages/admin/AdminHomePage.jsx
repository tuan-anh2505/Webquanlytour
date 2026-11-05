import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/** Trang truy cập nhanh, không hiển thị số liệu doanh thu giả khi dashboard chưa triển khai. */
export function AdminHomePage() {
  const { operationsUser: user, can } = useAuth();
  const modules = [
    { title: 'Booking & hành khách', description: 'Theo dõi đơn, xác nhận và xử lý yêu cầu hủy tour.', url: '/admin/bookings', allowed: can('bookings.read'), symbol: '▤' },
    { title: 'Thanh toán & hoàn tiền', description: 'Kiểm tra giao dịch và hoàn tiền trong môi trường thử nghiệm.', url: '/admin/payments', allowed: can('payments.read'), symbol: '◇' },
    { title: 'Tour & hành trình', description: 'Biên tập tour, hình ảnh, lịch trình và lịch khởi hành.', url: '/admin/tours', allowed: can('tours.read'), symbol: '⌖' },
    { title: 'Danh mục tour', description: 'Tổ chức các nhóm tour để khách dễ tìm hành trình.', url: '/admin/categories', allowed: can('categories.read'), symbol: '◈' },
    { title: 'Người dùng & phân quyền', description: 'Quản lý tài khoản và quyền thao tác của nhân viên.', url: '/admin/users', allowed: user.role === 'admin', symbol: '◎' },
  ].filter(module => module.allowed);
  return <><span className="eyebrow">QUẢN LÝ TẬP TRUNG</span><h1>Xin chào, {user.full_name}</h1><p className="muted">Chọn chức năng để bắt đầu công việc hôm nay.</p><div className="module-grid">{modules.map(module => <Link className="module-card" to={module.url} key={module.url}><span>{module.symbol}</span><h2>{module.title}</h2><p>{module.description}</p><strong>Mở chức năng →</strong></Link>)}</div>{!modules.length && <div className="notice info">Tài khoản của bạn chưa được cấp quyền đọc module. Vui lòng liên hệ Admin.</div>}<div className="subtle-panel"><h2>Nội dung rõ ràng, hành trình trọn vẹn</h2><p>Kiểm tra thông tin tour, giá và lịch khởi hành trước khi công khai để khách hàng lựa chọn đúng chuyến đi phù hợp.</p></div></>;
}
