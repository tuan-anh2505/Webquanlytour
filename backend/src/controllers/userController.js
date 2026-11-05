const bcrypt = require('bcrypt');
const User = require('../models/UserModel');
const validate = require('../validators/authValidator');
const { PERMISSION_KEYS, PERMISSIONS } = require('../config/permissions');

/** Kiểm tra giá trị enum theo schema hiện hữu, không thêm vai trò Vendor. */
function enumValue(value, field, allowed) {
    if (!allowed.includes(value)) throw validate.validationError(`${field} không hợp lệ.`, field);
    return value;
}

/** Phân trang và tìm kiếm tài khoản, không trả hash mật khẩu. */
async function list(req, res) {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw validate.validationError('Phân trang không hợp lệ.');
    }
    const q = req.query.q == null ? '' : validate.text(req.query.q, 'q', { required: false, max: 150 }) || '';
    const role = req.query.role ? enumValue(req.query.role, 'role', ['admin', 'staff', 'customer']) : '';
    const { rows, total } = await User.list({ page, limit, q, role });
    res.json({ data: rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}

/** Admin tạo tài khoản vận hành; chỉ endpoint quản trị này được nhận role. */
async function create(req, res) {
    const body = validate.objectBody(req.body);
    validate.allowFields(body, ['full_name', 'email', 'phone', 'password', 'role']);
    const data = {
        full_name: validate.text(body.full_name, 'full_name', { max: 150 }), email: validate.email(body.email),
        phone: validate.phone(body.phone), role: enumValue(body.role || 'staff', 'role', ['admin', 'staff', 'customer'])
    };
    const password = validate.password(body.password);
    if (await User.findByEmail(data.email)) throw Object.assign(new Error('Email đã được sử dụng.'), { status: 409 });
    data.password_hash = await bcrypt.hash(password, 12);
    const id = await User.create(data);
    res.status(201).json({ data: await User.findById(id) });
}

/** Sửa trạng thái/vai trò có bảo vệ Admin cuối cùng; không có API xóa tài khoản. */
async function update(req, res) {
    const id = validate.userId(req.params.id);
    const body = validate.objectBody(req.body);
    validate.allowFields(body, ['full_name', 'phone', 'role', 'status']);
    if (!Object.keys(body).length) throw validate.validationError('Vui lòng nhập thông tin cần cập nhật.');
    const changes = {};
    if (Object.hasOwn(body, 'full_name')) changes.full_name = validate.text(body.full_name, 'full_name', { max: 150 });
    if (Object.hasOwn(body, 'phone')) changes.phone = validate.phone(body.phone);
    if (Object.hasOwn(body, 'role')) changes.role = enumValue(body.role, 'role', ['admin', 'staff', 'customer']);
    if (Object.hasOwn(body, 'status')) changes.status = enumValue(body.status, 'status', ['active', 'banned']);
    res.json({ data: await User.updateByAdmin(id, changes) });
}

/** Cung cấp danh sách khóa quyền để giao diện không phải hard-code ngoài backend. */
async function permissionDefinitions(req, res) {
    res.json({ data: PERMISSIONS });
}

/** Xem các quyền đã gán cho một Staff. */
async function getPermissions(req, res) {
    const id = validate.userId(req.params.id);
    const user = await User.findById(id);
    if (!user) throw Object.assign(new Error('Không tìm thấy tài khoản.'), { status: 404 });
    if (user.role !== 'staff') throw validate.validationError('Tài khoản này không phải Staff.');
    res.json({ data: await User.permissionsFor(id) });
}

/** Admin cấp/thu hồi quyền bằng danh sách đầy đủ đã được kiểm tra với whitelist. */
async function setPermissions(req, res) {
    const id = validate.userId(req.params.id);
    const body = validate.objectBody(req.body);
    validate.allowFields(body, ['permissions']);
    if (!Array.isArray(body.permissions) || body.permissions.some(key => typeof key !== 'string' || !PERMISSION_KEYS.includes(key))) {
        throw validate.validationError('Danh sách quyền không hợp lệ.', 'permissions');
    }
    const permissions = [...new Set(body.permissions)].sort();
    res.json({ data: await User.replacePermissions(id, permissions) });
}

module.exports = { list, create, update, permissionDefinitions, getPermissions, setPermissions };
