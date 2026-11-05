/** Lỗi đầu vào có cấu trúc để giao diện hiển thị đúng trường bị sai. */
function validationError(message, field) {
    const error = Object.assign(new Error(message), { status: 400 });
    if (field) error.errors = [{ field, message }];
    return error;
}

/** Đảm bảo body là object JSON, không nhận mảng/null hoặc dữ liệu primitive. */
function objectBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationError('Dữ liệu gửi lên phải là object JSON.');
    return body;
}

/** Chuẩn hóa chuỗi nhưng không ép kiểu để tránh chấp nhận object/array ngoài ý muốn. */
function text(value, field, { required = true, max = 255 } = {}) {
    if (typeof value !== 'string') {
        if (!required && value == null) return null;
        throw validationError(`${field} không hợp lệ.`, field);
    }
    const result = value.trim();
    if ((required && !result) || result.length > max) throw validationError(`${field} phải có từ 1 đến ${max} ký tự.`, field);
    return result || null;
}

/** Email được lưu chữ thường để đăng ký/đăng nhập nhất quán. */
function email(value) {
    const result = text(value, 'email', { max: 255 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw validationError('Email không đúng định dạng.', 'email');
    return result;
}

/** bcrypt chỉ xử lý tối đa 72 byte; không trim mật khẩu hoặc âm thầm cắt phần cuối. */
function password(value) {
    if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value, 'utf8') > 72) {
        throw validationError('Mật khẩu cần ít nhất 8 ký tự và tối đa 72 byte UTF-8.', 'password');
    }
    return value;
}

/** Điện thoại là thông tin tùy chọn, cho phép ký tự định dạng thông dụng. */
function phone(value) {
    const result = text(value, 'phone', { required: false, max: 25 });
    if (result && !/^[+\d\s().-]{6,25}$/.test(result)) throw validationError('Số điện thoại không hợp lệ.', 'phone');
    return result;
}

/** ID BIGINT được giữ dạng chuỗi để không mất độ chính xác của JavaScript Number. */
function userId(value) {
    if (typeof value !== 'string' || !/^[1-9]\d{0,19}$/.test(value) || BigInt(value) > 18446744073709551615n) {
        throw validationError('Mã tài khoản không hợp lệ.', 'id');
    }
    return value;
}

/** Chỉ nhận các trường đã định nghĩa, chặn việc gán role/status bằng API hồ sơ công khai. */
function allowFields(body, fields) {
    const unknown = Object.keys(body).filter(key => !fields.includes(key));
    if (unknown.length) throw validationError(`Trường không được phép: ${unknown.join(', ')}.`, unknown[0]);
}

module.exports = { validationError, objectBody, text, email, password, phone, userId, allowFields };
