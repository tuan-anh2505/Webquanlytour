/** Chuyển số tiền DECIMAL thành BigInt để trừ hoàn tiền không sai phần lẻ. */
function cents(value) {
  const text = String(value ?? '0');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Số tiền dashboard không hợp lệ.');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -result : result;
}
function decimal(value) { const sign = value < 0n ? '-' : ''; const absolute = value < 0n ? -value : value; return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`; }

/** Không trộn tiền mock với tiền thật; khoảng ngày phản ánh dòng tiền thu/hoàn của từng kỳ. */
export function financialTotals(payment = {}) {
  return { net: decimal(cents(payment.gross) - cents(payment.returned)), mockNet: decimal(cents(payment.mock) - cents(payment.mock_returned)) };
}

/** Ngày không có booking được biểu diễn bằng 0 từ dữ liệu nhóm theo ngày, không tạo số liệu mẫu. */
export function dailySeries(from, to, rows = []) {
  const start = Date.parse(from + 'T00:00:00Z'), end = Date.parse(to + 'T00:00:00Z');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 365 * 86400000) return [];
  const values = new Map(rows.map(row => [row.day, Number(row.bookings)]));
  const result = [];
  for (let day = start; day <= end; day += 86400000) { const date = new Date(day).toISOString().slice(0, 10); result.push({ day: date, count: values.get(date) || 0 }); }
  return result;
}
