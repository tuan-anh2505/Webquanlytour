const common = require('./authValidator');
const { id } = require('./tourValidator');

/** Tạo lỗi đầu vào có HTTP status để API trả JSON thống nhất. */
function invalid(message, field) { throw common.validationError(message, field); }

/** Kiểm tra ngày sinh có thật; không chấp nhận ngày tương lai hoặc năm ngoài MySQL DATE. */
function birthDate(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid('Ngày sinh phải có dạng YYYY-MM-DD.', 'date_of_birth');
  const date = new Date(`${value}T00:00:00Z`);
  const todayInVietnam = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value || Number(value.slice(0, 4)) < 1000 || value > todayInVietnam) {
    invalid('Ngày sinh không hợp lệ.', 'date_of_birth');
  }
  return value;
}

/** Chuẩn hóa một hành khách; giá và việc chiếm chỗ luôn do server quyết định. */
function passenger(body) {
  common.objectBody(body);
  common.allowFields(body, ['full_name', 'passenger_type', 'date_of_birth', 'gender', 'document_type', 'document_number']);
  if (!['adult', 'child', 'infant'].includes(body.passenger_type)) invalid('Loại hành khách không hợp lệ.', 'passenger_type');
  const result = {
    full_name: common.text(body.full_name, 'full_name', { max: 150 }),
    passenger_type: body.passenger_type,
    date_of_birth: birthDate(body.date_of_birth),
    gender: body.gender === '' || body.gender == null ? null : body.gender,
    document_type: body.document_type === '' || body.document_type == null ? null : body.document_type,
    document_number: common.text(body.document_number, 'document_number', { required: false, max: 100 })
  };
  if (result.gender !== null && !['male', 'female', 'other'].includes(result.gender)) invalid('Giới tính không hợp lệ.', 'gender');
  if (result.document_type !== null && !['id_card', 'passport'].includes(result.document_type)) invalid('Loại giấy tờ không hợp lệ.', 'document_type');
  if (Boolean(result.document_type) !== Boolean(result.document_number)) invalid('Loại và số giấy tờ phải được nhập cùng nhau.', 'document_number');
  return result;
}

/** Booking chỉ nhận lịch, liên hệ và hành khách; chặn gán giá, trạng thái hoặc chủ đơn. */
function create(body) {
  common.objectBody(body);
  common.allowFields(body, ['schedule_id', 'contact_name', 'contact_email', 'contact_phone', 'customer_note', 'passengers']);
  if (!Array.isArray(body.passengers) || body.passengers.length < 1 || body.passengers.length > 30) invalid('Mỗi booking cần từ 1 đến 30 hành khách.', 'passengers');
  const passengers = body.passengers.map(passenger);
  if (!passengers.some(item => item.passenger_type === 'adult')) invalid('Booking cần ít nhất một người lớn.', 'passengers');
  const phone = common.phone(body.contact_phone);
  if (!phone) invalid('Vui lòng nhập số điện thoại liên hệ.', 'contact_phone');
  return {
    schedule_id: id(body.schedule_id, 'Lịch khởi hành'),
    contact_name: common.text(body.contact_name, 'contact_name', { max: 150 }),
    contact_email: common.email(body.contact_email),
    contact_phone: phone,
    customer_note: common.text(body.customer_note, 'customer_note', { required: false, max: 5000 }),
    passengers
  };
}

/** UUID của yêu cầu tạo đơn được lưu trong booking_code để retry không giữ chỗ hai lần. */
function idempotencyKey(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    invalid('Cần header Idempotency-Key là UUID v4 hợp lệ.', 'Idempotency-Key');
  }
  return value.toLowerCase();
}

/** Lọc danh sách bằng tham số đã kiểm tra, không nhận mảng hoặc biểu thức SQL. */
function list(query = {}) {
  const page = Number(query.page || 1), limit = Number(query.limit || 20);
  if (typeof query.page === 'object' || typeof query.limit === 'object' || !Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    invalid('Phân trang không hợp lệ.');
  }
  const status = query.status || '';
  if (status && !['pending', 'confirmed', 'cancelled', 'completed', 'expired'].includes(status)) invalid('Trạng thái booking không hợp lệ.', 'status');
  return { page, limit, status, q: query.q == null ? '' : common.text(query.q, 'q', { required: false, max: 150 }) || '' };
}

/** Lý do hủy là văn bản; không cho API hủy tự gán status, refund hay seat_count. */
function cancellation(body) {
  common.objectBody(body);
  common.allowFields(body, ['reason']);
  return common.text(body.reason, 'reason', { required: false, max: 500 }) || 'Khách hàng hoặc nhân viên yêu cầu hủy.';
}

/** Ghi chú xác nhận của nhân viên là tùy chọn và không có quyền thay đổi số tiền. */
function confirmation(body) {
  common.objectBody(body);
  common.allowFields(body, ['note']);
  return common.text(body.note, 'note', { required: false, max: 500 }) || 'Nhân viên xác nhận booking đã đủ điều kiện.';
}

module.exports = { create, list, cancellation, confirmation, idempotencyKey, id, passenger };
