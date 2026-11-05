const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Test dùng repository được mock, không tạo tài khoản và không sửa database thật.
process.env.JWT_SECRET = 'auth-tests-only-secret-with-sufficient-length';
process.env.JWT_EXPIRES_IN = '8h';
const User = require('../src/models/UserModel');
const pool = require('../src/config/db');
const controller = require('../src/controllers/authController');
const middleware = require('../src/middlewares/auth');
const { getPortalConfig } = require('../src/config/authPortal');

/** Tạo response giả đủ để kiểm tra status/body của controller Express. */
function response() {
    return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

/** Gọi middleware độc lập và thu lại lỗi chuyển cho next(). */
async function callMiddleware(handler, req) {
    let error;
    let called = false;
    await handler(req, {}, value => { called = true; error = value; });
    assert.equal(called, true);
    return error;
}

/** JWT thật dùng trong kiểm thử chữ ký, issuer, audience và trạng thái bị khóa. */
function token(id = '1', options = {}, portal = 'customer') {
    const config = getPortalConfig(portal);
    return jwt.sign({ portal }, config.secret, {
        algorithm: 'HS256', subject: id, issuer: config.issuer, audience: config.audience, expiresIn: '1h', ...options
    });
}

test('đăng ký từ chối role/status đặc quyền trước khi gọi repository', async t => {
    const create = t.mock.method(User, 'create', async () => { throw new Error('Must not insert'); });
    for (const field of ['role', 'status']) {
        await assert.rejects(controller.register({ body: {
            full_name: 'Khách hàng', email: 'guest@example.com', password: 'Password123', [field]: 'admin'
        } }, response()), error => error.status === 400);
    }
    assert.equal(create.mock.callCount(), 0);
});

test('đăng ký hash mật khẩu, luôn tạo customer và chỉ trả hồ sơ an toàn', async t => {
    let saved;
    t.mock.method(User, 'findByEmail', async () => undefined);
    t.mock.method(User, 'create', async data => { saved = data; return '9007199254740993'; });
    t.mock.method(User, 'findById', async id => ({ id, email: 'guest@example.com', full_name: 'Khách hàng', phone: null, role: 'customer', status: 'active' }));
    const res = response();
    await controller.register({ body: { full_name: ' Khách hàng ', email: 'GUEST@example.com', password: 'Password123' } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(saved.role, 'customer');
    assert.equal(saved.email, 'guest@example.com');
    assert.equal(saved.full_name, 'Khách hàng');
    assert.notEqual(saved.password_hash, 'Password123');
    assert.equal(await bcrypt.compare('Password123', saved.password_hash), true);
    assert.equal(JSON.stringify(res.body).includes('password_hash'), false);
    const payload = jwt.verify(res.body.data.token, process.env.JWT_SECRET, middleware.JWT_OPTIONS);
    assert.equal(payload.sub, '9007199254740993');
    assert.equal(payload.portal, 'customer');
    assert.ok(payload.exp > payload.iat);
});

test('đăng ký từ chối mật khẩu vượt 72 byte UTF-8 và email đã sử dụng', async t => {
    t.mock.method(User, 'findByEmail', async () => ({ id: '1' }));
    const body = { full_name: 'Khách hàng', email: 'guest@example.com', password: 'Đ'.repeat(37) };
    await assert.rejects(controller.register({ body }, response()), error => error.status === 400);
    body.password = 'Password123';
    await assert.rejects(controller.register({ body }, response()), error => error.status === 409);
});

test('đăng nhập nội bộ trả token hợp lệ, không trả hash; tài khoản banned bị từ chối', async t => {
    const account = { id: '2', email: 'staff@example.com', role: 'staff', status: 'active', password_hash: await bcrypt.hash('Password123', 4) };
    t.mock.method(User, 'findByEmail', async () => account);
    const touch = t.mock.method(User, 'touchLogin', async () => {});
    t.mock.method(User, 'findById', async () => ({ id: '2', email: account.email, role: account.role, status: account.status }));
    t.mock.method(User, 'permissionsFor', async () => ['tours.read']);
    const res = response();
    await controller.loginOperations({ body: { email: account.email, password: 'Password123' } }, res);
    assert.equal(touch.mock.callCount(), 1);
    assert.deepEqual(res.body.data.user.permissions, ['tours.read']);
    assert.equal(JSON.stringify(res.body).includes('password_hash'), false);
    const config = getPortalConfig('operations');
    const payload = jwt.verify(res.body.data.token, config.secret, config.verifyOptions);
    assert.equal(payload.sub, '2');
    assert.equal(payload.portal, 'operations');
    account.status = 'banned';
    await assert.rejects(controller.loginOperations({ body: { email: account.email, password: 'Password123' } }, response()), error => error.status === 401);
    assert.equal(touch.mock.callCount(), 1);
});

test('JWT cũ bị từ chối ngay khi tài khoản bị khóa hoặc bị xóa', async t => {
    let account = { id: '1', role: 'customer', status: 'active' };
    t.mock.method(User, 'findById', async () => account && { ...account });
    const req = { headers: { authorization: `Bearer ${token()}` } };
    assert.equal(await callMiddleware(middleware.authenticate, req), undefined);
    account.status = 'banned';
    assert.equal((await callMiddleware(middleware.authenticate, req)).status, 401);
    account = undefined;
    assert.equal((await callMiddleware(middleware.authenticate, req)).status, 401);
});

test('từ chối JWT hết hạn, sai issuer/audience và thiếu Bearer', async () => {
    for (const authorization of [undefined, 'Basic abc', `Bearer ${token('1', { expiresIn: '-1s' })}`, `Bearer ${token('1', { issuer: 'other-app' })}`, `Bearer ${token('1', { audience: 'other-client' })}`]) {
        const error = await callMiddleware(middleware.authenticate, { headers: { authorization } });
        assert.equal(error.status, 401);
    }
});

test('Staff đọc lại quyền trên từng request; Customer không thể dùng quyền Staff', async t => {
    let permissions = ['tours.write'];
    t.mock.method(User, 'findById', async () => ({ id: '3', role: 'staff', status: 'active' }));
    t.mock.method(User, 'permissionsFor', async () => [...permissions]);
    const req = { headers: { authorization: `Bearer ${token('3', {}, 'operations')}` } };
    assert.equal(await callMiddleware(middleware.authenticateOperations, req), undefined);
    assert.equal(await callMiddleware(middleware.requirePermission('tours.write'), req), undefined);
    permissions = [];
    assert.equal(await callMiddleware(middleware.authenticateOperations, req), undefined);
    assert.equal((await callMiddleware(middleware.requirePermission('tours.write'), req)).status, 403);
    req.user = { role: 'customer', permissions: ['tours.write'] };
    assert.equal((await callMiddleware(middleware.requirePermission('tours.write'), req)).status, 403);
    req.user = { role: 'admin', permissions: [] };
    assert.equal(await callMiddleware(middleware.requirePermission('tours.write'), req), undefined);
});

test('hồ sơ Customer từ chối sửa role/status và không nhận id người khác', async t => {
    const update = t.mock.method(User, 'updateProfile', async () => {});
    for (const changes of [{ role: 'admin' }, { status: 'active' }, { id: '5' }]) {
        await assert.rejects(controller.updateMe({ body: changes, user: { id: '1' } }, response()), error => error.status === 400);
    }
    assert.equal(update.mock.callCount(), 0);
});

test('khóa hoặc hạ quyền Admin hoạt động cuối cùng phải rollback', async t => {
    const account = { id: '1', full_name: 'Admin', phone: null, role: 'admin', status: 'active' };
    const connection = {
        async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
        async query(sql) {
            if (sql.startsWith('SELECT id FROM users')) { assert.match(sql, /ORDER BY id FOR UPDATE/); return [[{ id: '1' }]]; }
            if (sql.startsWith('SELECT')) return [[{ ...account }]];
            throw new Error('Must not update last active admin');
        }
    };
    const rollback = t.mock.method(connection, 'rollback', async () => {});
    const commit = t.mock.method(connection, 'commit', async () => {});
    const release = t.mock.method(connection, 'release', () => {});
    t.mock.method(pool, 'getConnection', async () => connection);
    await assert.rejects(User.updateByAdmin('1', { status: 'banned' }), error => error.status === 409);
    await assert.rejects(User.updateByAdmin('1', { role: 'staff' }), error => error.status === 409);
    assert.equal(rollback.mock.callCount(), 2);
    assert.equal(commit.mock.callCount(), 0);
    assert.equal(release.mock.callCount(), 2);
});

test('Admin có thể khóa một Admin khi vẫn còn Admin hoạt động khác', async t => {
    const account = { id: '2', full_name: 'Admin thứ hai', phone: null, role: 'admin', status: 'active' };
    const connection = {
        async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
        async query(sql, params) {
            if (sql.startsWith('SELECT id FROM users')) return [[{ id: '1' }, { id: '2' }]];
            if (sql.startsWith('UPDATE')) { account.status = params[3]; return [{ affectedRows: 1 }]; }
            return [[{ ...account }]];
        }
    };
    const commit = t.mock.method(connection, 'commit', async () => {});
    const rollback = t.mock.method(connection, 'rollback', async () => {});
    t.mock.method(pool, 'getConnection', async () => connection);
    assert.equal((await User.updateByAdmin('2', { status: 'banned' })).status, 'banned');
    assert.equal(commit.mock.callCount(), 1);
    assert.equal(rollback.mock.callCount(), 0);
});
