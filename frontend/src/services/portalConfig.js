const configuredPath = (import.meta.env || {}).VITE_OPERATIONS_LOGIN_PATH;

/** Cổng nội bộ dùng đường dẫn local riêng; không cho cấu hình URL ngoài hoặc trùng trang khách. */
export function operationsLoginPath(value = configuredPath) {
  return typeof value === 'string' && /^\/[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(value)
    && !['/login', '/register', '/account', '/admin'].includes(value)
    && !value.startsWith('/admin/')
    ? value.replace(/\/$/, '') : '/operations/sign-in';
}

export const OPERATIONS_LOGIN_PATH = operationsLoginPath();
