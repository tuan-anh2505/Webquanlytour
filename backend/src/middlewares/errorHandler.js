/** Trả lỗi 404 thống nhất cho API/đường dẫn không được khai báo. */
function notFound(req, res) {
  res.status(404).json({ message: 'Không tìm thấy chức năng được yêu cầu.' });
}

/** Chuyển lỗi nghiệp vụ/SQL sang HTTP, không làm lộ SQL, mật khẩu hay stack trace. */
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = Number.isInteger(error.status) ? error.status : 500;
  let message = error.message;
  if (error.type === 'entity.parse.failed') {
    status = 400;
    message = 'Dữ liệu JSON không hợp lệ.';
  } else if (error.type === 'entity.too.large') {
    status = 413;
    message = 'Dữ liệu gửi lên vượt quá dung lượng cho phép.';
  } else if (error.code === 'ER_DUP_ENTRY') {
    status = 409;
    message = 'Thông tin đã tồn tại. Vui lòng kiểm tra email, slug hoặc ngày khởi hành.';
  } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    status = 400;
    message = 'Dữ liệu liên kết không tồn tại.';
  } else if (error.code === 'ER_ROW_IS_REFERENCED_2') {
    status = 409;
    message = 'Dữ liệu đang được sử dụng bởi chức năng khác.';
  } else if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
    status = 409;
    message = 'Dữ liệu đang được xử lý đồng thời. Vui lòng thử lại yêu cầu.';
  } else if (['ER_CHECK_CONSTRAINT_VIOLATED', 'ER_DATA_TOO_LONG', 'WARN_DATA_TRUNCATED', 'ER_TRUNCATED_WRONG_VALUE'].includes(error.code)) {
    status = 400;
    message = 'Giá trị không đáp ứng ràng buộc dữ liệu.';
  }
  if (status < 400 || status > 599) status = 500;
  if (status >= 500) {
    console.error(JSON.stringify({ requestId: req.requestId, method: req.method, path: req.path, code: error.code || error.name }));
    message = 'Hệ thống tạm thời gặp lỗi. Vui lòng thử lại sau.';
  }
  const body = { message: message || 'Yêu cầu không hợp lệ.' };
  if (status < 500 && error.errors) body.errors = error.errors;
  return res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
