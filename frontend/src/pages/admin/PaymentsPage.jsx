import { Link, useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource';
import { EmptyState, Pagination, RequestState } from '../../components/Feedback';
import { paymentStatuses } from '../../services/booking';
import { dateTime, money } from '../../services/format';

/** Sổ giao dịch cho người có payments.read; không sinh doanh thu hoặc số liệu giả. */
export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const resource = useResource('/manage/payments?' + params);
  function search(event) { event.preventDefault(); const query = new URLSearchParams(); for (const [key, value] of new FormData(event.currentTarget)) if (value) query.set(key, value); setParams(query); }
  function page(value) { const query = new URLSearchParams(params); query.set('page', String(value)); setParams(query); }
  return <><div className="page-heading"><div><span className="eyebrow">THEO DÕI GIAO DỊCH</span><h1>Thanh toán</h1></div></div><p className="notice info">Các giao dịch hiện phục vụ kiểm tra luồng thanh toán và hoàn tiền mô phỏng, không thu tiền thật.</p><form className="toolbar" onSubmit={search} key={params.toString()}><label><span className="sr-only">Tìm giao dịch</span><input name="q" defaultValue={params.get('q') || ''} placeholder="Mã giao dịch hoặc mã booking…" maxLength={150} /></label><label><span className="sr-only">Trạng thái giao dịch</span><select name="status" defaultValue={params.get('status') || ''}><option value="">Tất cả trạng thái</option>{Object.entries(paymentStatuses).filter(([value]) => value !== 'unpaid').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="button secondary">Tìm kiếm</button></form><RequestState resource={resource}>{resource.data?.length ? <div className="table-wrap"><table><thead><tr><th>Giao dịch</th><th>Booking</th><th>Số tiền</th><th>Trạng thái</th><th /></tr></thead><tbody>{resource.data.map(payment => <tr key={payment.id}><td><strong>{payment.payment_reference}</strong><small>{dateTime(payment.created_at, true)}</small></td><td>{payment.booking?.booking_code || payment.booking_code || payment.booking_id}</td><td>{money(payment.amount)}</td><td><span className={'badge ' + payment.status}>{paymentStatuses[payment.status]}</span></td><td><Link className="text-button" to={'/admin/payments/' + encodeURIComponent(payment.payment_reference)}>Chi tiết →</Link></td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có giao dịch phù hợp">Các thanh toán mới sẽ được hiển thị khi khách tạo giao dịch.</EmptyState>}<Pagination meta={resource.meta} onChange={page} /></RequestState></>;
}
