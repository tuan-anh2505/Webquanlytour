import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteBooking, bookingPayload, vietnamTimestamp, holdSeconds, friendlyRefundReason } from '../src/services/booking.js';
import { money } from '../src/services/format.js';

test('ước tính giữ đúng phần lẻ và chính sách em bé không dùng chỗ', () => {
  const quote = quoteBooking([{ passenger_type: 'adult' }, { passenger_type: 'child' }, { passenger_type: 'infant' }], { adult_price: '100.10', child_price: '80.20', infant_price: '5.55' });
  assert.deepEqual(quote, { total: '185.85', seats: 2 });
  assert.deepEqual(quoteBooking([{ passenger_type: 'adult' }, { passenger_type: 'adult' }], { adult_price: '0.10' }), { total: '0.20', seats: 2 });
});

test('ước tính nhóm lớn không bị làm tròn sai và từ chối giá chưa hợp lệ', () => {
  const passengers = Array.from({ length: 30 }, () => ({ passenger_type: 'adult' }));
  assert.equal(quoteBooking(passengers, { adult_price: '9999999999.99' }).total, '299999999999.70');
  assert.throws(() => quoteBooking(passengers, { adult_price: 'not a price' }));
});

test('payload chỉ gửi dữ liệu hành khách/liên hệ, không nhận giá hoặc số chỗ từ client', () => {
  const payload = bookingPayload({ contact_name: ' Nguyễn A ', contact_email: 'a@example.com ', contact_phone: ' 0901234567', customer_note: ' Ghi chú ', total_price: 1, status: 'confirmed' }, [{ full_name: ' Nguyễn A ', passenger_type: 'adult', unit_price: 1, occupies_seat: false, unknown: 'injected' }], '9007199254740993');
  assert.deepEqual(payload, { schedule_id: '9007199254740993', contact_name: 'Nguyễn A', contact_email: 'a@example.com', contact_phone: '0901234567', customer_note: 'Ghi chú', passengers: [{ full_name: 'Nguyễn A', passenger_type: 'adult' }] });
});

test('cần người lớn, tối đa30người và giấy tờ phải đủ loại/số', () => {
  const contact = {};
  for (const rows of [[], [{ full_name: 'Em bé', passenger_type: 'infant' }], Array.from({ length: 31 }, () => ({ full_name: 'A', passenger_type: 'adult' })), [{ full_name: 'A', passenger_type: 'adult', document_type: 'passport' }]]) assert.throws(() => bookingPayload(contact, rows, '1'));
  assert.equal(bookingPayload(contact, [{ full_name: 'A', passenger_type: 'adult', document_type: 'passport', document_number: ' AB123 ' }], '1').passengers[0].document_number, 'AB123');
});

test('hạn giữ chỗ dùng giờ Việt Nam và không tạo thời gian âm sau hết hạn', () => {
  const local = '2027-03-01 08:00:00';
  const instant = Date.parse('2027-03-01T01:00:00Z');
  assert.equal(vietnamTimestamp(local), instant);
  assert.equal(vietnamTimestamp('2027-03-01T01:00:00Z'), instant);
  assert.equal(holdSeconds(local, instant - 30500), 31);
  assert.equal(holdSeconds(local, instant + 1000), 0);
});

test('tiền có phần lẻ được hiển thị để không khác số tiền đã chốt', () => {
  assert.match(money('100.01'), /100,01/);
  assert.doesNotMatch(money('100.00'), /100,00/);
});

test('lý do hoàn tiền hiển thị dễ hiểu và loại bỏ dấu đánh dấu webhook nội bộ', () => {
  assert.equal(friendlyRefundReason('[DUPLICATE_PAYMENT] Đã có giao dịch thanh toán.'), 'Thanh toán trùng lặp: Đã có giao dịch thanh toán.');
  assert.equal(friendlyRefundReason('Khách yêu cầu hủy.'), 'Khách yêu cầu hủy.');
  assert.equal(friendlyRefundReason(null), '');
});
