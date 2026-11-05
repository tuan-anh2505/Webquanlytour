/**
 * Lập lịch thu hồi chỗ hết hạn. Không chạy chồng trong một tiến trình;
 * service dùng khóa MySQL để nhiều tiến trình cũng không trả chỗ hai lần.
 */
function createBookingExpiryJob({
  expire = (options) => require('../services/bookingService').expireDueBookings(options),
  intervalMs = Number(process.env.BOOKING_EXPIRY_INTERVAL_MS || 60000),
  limit = Number(process.env.BOOKING_EXPIRY_BATCH_SIZE || 100),
  onError = (error) => console.error(JSON.stringify({ job: 'booking-expiry', code: error.code || error.name }))
} = {}) {
  let timer = null;
  let active = null;
  let stopped = true;

  /** Bỏ qua tick khi lần trước chưa hoàn tất; không để rejection làm chết tiến trình. */
  function tick() {
    if (stopped || active) return active;
    active = Promise.resolve().then(() => expire({ limit })).then((result) => {
      if (result?.failed) {
        // Báo số lỗi tổng hợp, vẫn để service xử lý các đơn còn lại trong batch.
        onError(Object.assign(new Error('Một số booking hết hạn chưa xử lý được.'), {
          code: `BATCH_FAILED_${result.failed}`
        }));
      }
      return result;
    }).catch(onError).finally(() => { active = null; });
    return active;
  }

  /** Chạy ngay lần đầu và đặt chu kỳ; không tự tạo lại timer nếu đã khởi động. */
  function start() {
    if (!stopped) return;
    stopped = false;
    timer = setInterval(tick, intervalMs);
    timer.unref?.();
    tick();
  }

  /** Hủy tick mới và chờ transaction đang xử lý trước khi đóng pool MySQL. */
  async function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
    if (active) await active;
  }

  return { start, stop, tick };
}

module.exports = { createBookingExpiryJob };
