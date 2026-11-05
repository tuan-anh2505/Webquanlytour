const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/UserModel');
const validate = require('../validators/authValidator');
const { getPortalConfig } = require('../config/authPortal');

/** Tạo token có phạm vi cổng rõ ràng; quyền thực vẫn được đọc lại từ DB mỗi request. */
function createToken(user, portal = 'customer') {
    const config = getPortalConfig(portal);
    return jwt.sign({ portal }, config.secret, {
        algorithm: 'HS256', subject: String(user.id), issuer: config.issuer,
        audience: config.audience, expiresIn: config.expiresIn
    });
}

/** Bổ sung quyền cho giao diện mà không để lộ password_hash. */
async function publicUser(id) {
    const user = await User.findById(id);
    if (!user) return undefined;
    user.permissions = user.role === 'staff' ? await User.permissionsFor(id) : [];
    return user;
}

/** Đăng ký công khai luôn là Customer; hash mật khẩu trước khi lưu database. */
async function register(req, res) {
    const body = validate.objectBody(req.body);
    validate.allowFields(body, ['full_name', 'email', 'phone', 'password']);
    const data = {
        full_name: validate.text(body.full_name, 'full_name', { max: 150 }),
        email: validate.email(body.email), phone: validate.phone(body.phone)
    };
    const password = validate.password(body.password);
    if (await User.findByEmail(data.email)) throw Object.assign(new Error('Email đã được sử dụng.'), { status: 409 });
    data.password_hash = await bcrypt.hash(password, 12);
    const id = await User.create({ ...data, role: 'customer' });
    const user = await publicUser(id);
    res.status(201).json({ data: { user, token: createToken(user) } });
}

/**
 * Dùng chung bước kiểm tra mật khẩu nhưng chỉ cấp token cho vai trò của đúng cổng.
 * Sai email, mật khẩu, vai trò hoặc trạng thái đều cùng phản hồi để tránh dò tài khoản.
 */
async function loginForPortal(req, res, portal) {
    const config = getPortalConfig(portal);
    const body = validate.objectBody(req.body);
    validate.allowFields(body, ['email', 'password']);
    const email = validate.email(body.email);
    const password = validate.password(body.password);
    const account = await User.findByEmail(email);
    // Hash cố định giúp vẫn thực hiện bcrypt khi không có tài khoản, giảm chênh lệch thời gian.
    const dummyHash = '$2b$12$GgGCOum8B3S/ocGJqQe.oe0PIc5fM9IQPYfZzz81G2.sVJlMhCB3W';
    const matches = await bcrypt.compare(password, account ? account.password_hash : dummyHash);
    if (!account || !matches || account.status !== 'active' || !config.roles.includes(account.role)) {
        throw Object.assign(new Error('Email, mật khẩu không đúng hoặc tài khoản đã bị khóa.'), { status: 401 });
    }
    const user = await publicUser(account.id);
    if (!user || user.status !== 'active' || !config.roles.includes(user.role)) {
        throw Object.assign(new Error('Email, mật khẩu không đúng hoặc tài khoản đã bị khóa.'), { status: 401 });
    }
    await User.touchLogin(account.id);
    res.json({ data: { user, token: createToken(user, portal) } });
}

/** Cổng đăng nhập công khai chỉ chấp nhận Customer, không gợi ý đường dẫn quản trị. */
async function login(req, res) { return loginForPortal(req, res, 'customer'); }

/** Cổng đăng nhập nội bộ chỉ chấp nhận Admin/Staff và phát hành token operations riêng. */
async function loginOperations(req, res) { return loginForPortal(req, res, 'operations'); }

/** Trả lại hồ sơ của chính chủ từ middleware xác thực. */
async function me(req, res) {
    res.json({ data: req.user });
}

/** Chỉ sửa hồ sơ chính chủ, mọi trường đặc quyền đều bị từ chối. */
async function updateMe(req, res) {
    const body = validate.objectBody(req.body);
    validate.allowFields(body, ['full_name', 'phone']);
    if (!Object.keys(body).length) throw validate.validationError('Vui lòng nhập thông tin cần cập nhật.');
    const full_name = Object.hasOwn(body, 'full_name') ? validate.text(body.full_name, 'full_name', { max: 150 }) : req.user.full_name;
    const phone = Object.hasOwn(body, 'phone') ? validate.phone(body.phone) : req.user.phone;
    await User.updateProfile(req.user.id, { full_name, phone });
    res.json({ data: await publicUser(req.user.id) });
}

module.exports = { register, login, loginOperations, me, updateMe };
