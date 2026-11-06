import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailySeries, financialTotals } from '../src/services/dashboard.js';

test('dashboard không trộn thu mock với tiền thật và giữ chính xác phần lẻ', () => {
  assert.deepEqual(financialTotals({ gross: '100.10', returned: '20.01', mock: '1000.99', mock_returned: '0.01' }), { net: '80.09', mockNet: '1000.98' });
  assert.equal(financialTotals({ gross: '0', returned: '1.05' }).net, '-1.05');
});
test('series dùng đúng ngày, điền 0 cho ngày không có booking, không tạo số liệu mẫu', () => {
  assert.deepEqual(dailySeries('2030-01-01', '2030-01-03', [{ day: '2030-01-02', bookings: '2' }]), [{ day: '2030-01-01', count: 0 }, { day: '2030-01-02', count: 2 }, { day: '2030-01-03', count: 0 }]);
  assert.deepEqual(dailySeries('bad', '2030-01-01'), []);
});
