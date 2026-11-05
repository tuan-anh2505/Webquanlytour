import { useEffect, useMemo, useState } from 'react';
import { vietnamTimestamp } from '../services/booking';

/** Ước tính đồng hồ server từ lần nhận dữ liệu, giảm sai lệch khi máy khách đặt giờ khác. */
export function useServerClock(serverNow) {
  const anchor = useMemo(() => ({ local: Date.now(), server: vietnamTimestamp(serverNow) }), [serverNow]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Number.isFinite(anchor.server) ? anchor.server + now - anchor.local : now;
}
