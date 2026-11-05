export const passengerLabels = { adult: 'Người lớn', child: 'Trẻ em', infant: 'Em bé' };
export const bookingStatuses = { pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', cancelled: 'Đã hủy', completed: 'Đã hoàn thành', expired: 'Hết hạn giữ chỗ' };
export const paymentStatuses = { unpaid: 'Chưa thanh toán', processing: 'Đang xử lý', success: 'Thành công', failed: 'Không thành công' };
export const refundStatuses = { requested: 'Đã yêu cầu hoàn tiền', processing: 'Đang xử lý hoàn tiền', success: 'Đã hoàn tiền', failed: 'Hoàn tiền không thành công' };

/** Chuyển dấu đánh dấu nội bộ của webhook thành lý do dễ hiểu trước khi hiển thị cho khách. */
export function friendlyRefundReason(reason) {
  return typeof reason === 'string' ? reason.replace(/\[DUPLICATE_PAYMENT\]/g, 'Thanh toán trùng lặp:').trim() : '';
}

/** Quy đổi chuỗi DECIMAL sang đơn vị nhỏ nhất để ước tính giá không sai số Number. */
function cents(value) {
  const text = String(value ?? '0');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Giá hiện tại không hợp lệ. Vui lòng tải lại lịch khởi hành.');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/** Ước tính từ giá lịch đang hiển thị; backend luôn chốt lại giá, chính sách và số chỗ. */
export function quoteBooking(passengers, schedule) {
  let total = 0n, seats = 0;
  for (const passenger of passengers) {
    const priceKey = { adult: 'adult_price', child: 'child_price', infant: 'infant_price' }[passenger.passenger_type];
    if (!priceKey) throw new Error('Loại hành khách không hợp lệ.');
    total += cents(schedule[priceKey]);
    if (passenger.passenger_type !== 'infant') seats++;
  }
  return { total: `${total / 100n}.${String(total % 100n).padStart(2, '0')}`, seats };
}

/** Chỉ gửi thông tin liên hệ/hành khách; bỏ mọi giá, số chỗ và trạng thái client tự thêm. */
export function bookingPayload(contact, passengers, scheduleId) {
  if (!passengers.length || passengers.length > 30 || !passengers.some(row => row.passenger_type === 'adult')) throw new Error('Mỗi đơn cần ít nhất một người lớn và tối đa 30 hành khách.');
  const rows = passengers.map(row => {
    if (!passengerLabels[row.passenger_type] || !row.full_name?.trim()) throw new Error('Vui lòng điền họ tên và loại của tất cả hành khách.');
    const passenger = { full_name: row.full_name.trim(), passenger_type: row.passenger_type };
    for (const key of ['date_of_birth', 'gender', 'document_type', 'document_number']) if (typeof row[key] === 'string' && row[key].trim()) passenger[key] = row[key].trim();
    if (Boolean(passenger.document_type) !== Boolean(passenger.document_number)) throw new Error('Vui lòng nhập cả loại và số giấy tờ, hoặc để trống cả hai.');
    return passenger;
  });
  return { schedule_id: String(scheduleId), contact_name: String(contact.contact_name || '').trim(), contact_email: String(contact.contact_email || '').trim(), contact_phone: String(contact.contact_phone || '').trim(), ...(contact.customer_note?.trim() ? { customer_note: contact.customer_note.trim() } : {}), passengers: rows };
}

/** DATETIME không offset từ MySQL được hiểu là giờ Việt Nam, không theo múi giờ của máy khách. */
export function vietnamTimestamp(value) {
  if (!value) return NaN;
  const text = String(value).replace(' ', 'T');
  return Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(text) ? text : `${text}+07:00`);
}

/** Đếm thời gian hiển thị; trạng thái hết hạn thật chỉ được quyết định bởi backend. */
export function holdSeconds(expiresAt, now = Date.now()) {
  const expires = vietnamTimestamp(expiresAt);
  return Number.isFinite(expires) ? Math.max(0, Math.ceil((expires - now) / 1000)) : 0;
}
