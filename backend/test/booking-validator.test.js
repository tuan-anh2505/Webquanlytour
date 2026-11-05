const { test } = require('node:test');
const assert = require('node:assert/strict');
const validate = require('../src/validators/bookingValidator');
const pricing = require('../src/services/bookingService');

/** Dữ liệu yêu cầu hợp lệ chỉ có trường khách được phép khai báo. */
function input() {
  return { schedule_id: '10', contact_name: '  Nguyễn An  ', contact_email: 'AN@example.com', contact_phone: '+84901234567',
    passengers: [{ full_name: 'Nguyễn An', passenger_type: 'adult' }] };
}

test('booking chuẩn hóa liên hệ và từ chối gán giá/chỗ/trạng thái/chủ đơn', () => {
  const value = validate.create(input());
  assert.equal(value.contact_name, 'Nguyễn An');
  assert.equal(value.contact_email, 'an@example.com');
  for (const key of ['customer_id', 'status', 'seat_count', 'subtotal', 'total_price', 'promotion_code']) {
    assert.throws(() => validate.create({ ...input(), [key]: '1' }), { status: 400 });
  }
  assert.throws(() => validate.create({ ...input(), passengers: [{ full_name: 'An', passenger_type: 'adult', unit_price: 0 }] }), { status: 400 });
});

test('yêu cầu người lớn, giới hạn 30 người và chặn giấy tờ/ngày sinh không hợp lệ', () => {
  for (const passengers of [[], Array.from({ length: 31 }, () => ({ full_name: 'An', passenger_type: 'adult' })), [{ full_name: 'Bé', passenger_type: 'infant' }]]) {
    assert.throws(() => validate.create({ ...input(), passengers }), { status: 400 });
  }
  for (const changes of [{ date_of_birth: '2027-02-29' }, { date_of_birth: '9999-01-01' }, { gender: false }, { document_type: false }, { document_type: 'passport' }, { document_number: 'A1234' }]) {
    assert.throws(() => validate.passenger({ full_name: 'An', passenger_type: 'adult', ...changes }), { status: 400 });
  }
  assert.equal(validate.passenger({ full_name: 'An', passenger_type: 'adult', date_of_birth: '2000-02-29' }).date_of_birth, '2000-02-29');
});

test('Idempotency-Key phải là UUIDv4, giữ BIGINT chính xác và giới hạn phân trang', () => {
  assert.equal(validate.idempotencyKey('123E4567-E89B-42D3-A456-426614174000'), '123e4567-e89b-42d3-a456-426614174000');
  for (const value of [undefined, 'not-uuid', '123e4567-e89b-12d3-a456-426614174000']) assert.throws(() => validate.idempotencyKey(value), { status: 400 });
  assert.equal(validate.id('18446744073709551615'), '18446744073709551615');
  for (const query of [{ limit: '101' }, { page: ['1'] }, { q: ['test'] }, { status: 'paid' }]) assert.throws(() => validate.list(query), { status: 400 });
});

test('giá dùng BigInt chính xác, giá lịch ưu tiên và infant không chiếm ghế', () => {
  const people = ['adult', 'child', 'infant'].map(passenger_type => ({ full_name: 'An', passenger_type }));
  const result = pricing.pricePassengers(people, { base_price: '0.10', child_price: '0.20', infant_price: '0.01' }, { adult_price_override: '1.10' });
  assert.equal(result.total, '1.31');
  assert.equal(result.seatCount, 2);
  assert.deepEqual(result.passengers.map(person => person.occupies_seat), [1, 1, 0]);
  assert.equal(result.passengers[0].unit_price, '1.10');
  assert.throws(() => pricing.pricePassengers(people, { base_price: '9999999999.99', child_price: '1.00', infant_price: '0.00' }, {}), { status: 400 });
});
