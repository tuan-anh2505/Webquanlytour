import { useEffect, useState } from 'react';
import { api } from '../services/api';

/** Tải tài nguyên theo URL; hủy yêu cầu cũ khi bộ lọc đổi hoặc trang được tháo. */
export function useResource(path) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: '' });
  useEffect(() => {
    if (!path) { setState({ data: null, meta: null, loading: false, error: '' }); return; }
    const controller = new AbortController();
    setState(previous => ({ ...previous, loading: true, error: '' }));
    api.get(path, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setState({ data: result.data, meta: result.meta, loading: false, error: '' }); })
      .catch(error => { if (!controller.signal.aborted) setState({ data: null, meta: null, loading: false, error: error.message || 'Không thể kết nối máy chủ.' }); });
    return () => controller.abort();
  }, [path, version]);
  return { ...state, reload: () => setVersion(value => value + 1) };
}
