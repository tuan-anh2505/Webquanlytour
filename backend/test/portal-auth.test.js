const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'customer-portal-test-secret-at-least-thirty-two-bytes';
process.env.INTERNAL_JWT_SECRET = 'operations-portal-test-secret-at-least-thirty-two-bytes';
const User = require('../src/models/UserModel');
const controller = require('../src/controllers/authController');
const { authenticate, authenticateOperations } = require('../src/middlewares/auth');
const { getPortalConfig } = require('../src/config/authPortal');

/** Phản hồi giả để kiểm thử luồng login thật mà không ghi database. */
function response() {
    return { json(body) { this.body = body; return this; } };
}

/** Token thử nghiệm giữ nguyên chữ ký/audience thực tế, có thể thay scope để thử tấn công. */
function token(portal, payload = {}) {
    const config = getPortalConfig(portal);
    return jwt.sign({ portal, ...payload }, config.secret, {
        algorithm: 'HS256', subject: '10', issuer: config.issuer,
        audience: config.audience, expiresIn: '1h'
    });
}

/** Thu lỗi next() để kiểm tra middleware chưa cho request đi tiếp. */
async function authorize(handler, signedToken) {
    let error;
    const req = { headers: { authorization: `Bearer ${signedToken}` } };
    await handler(req, {}, (value) => { error = value; });
    return { error, req };
}

test('API công khai từ chối Admin/Staff dù mật khẩu đúng, không tiết lộ cổng nội bộ', async (t) => {
    const password_hash = await bcrypt.hash('Password123', 4);
    let role = 'admin';
    t.mock.method(User, 'findByEmail', async () => ({ id: '10', role, status: 'active', password_hash }));
    const touch = t.mock.method(User, 'touchLogin', async () => {});
    const errors = [];
    for (role of ['admin', 'staff']) {
        await assert.rejects(controller.login({ body: { email: 'person@example.com', password: 'Password123' } }, response()), (error) => {
            errors.push(error.message);
            return error.status === 401 && !/admin|staff|operations|nội bộ/i.test(error.message);
        });
    }
    assert.equal(errors[0], errors[1]);
    assert.equal(touch.mock.callCount(), 0);
});

test('API nội bộ chỉ cấp phiên operations cho Admin/Staff, Customer bị từ chối', async (t) => {
    const password_hash = await bcrypt.hash('Password123', 4);
    let role = 'customer';
    t.mock.method(User, 'findByEmail', async () => ({ id: '10', role, status: 'active', password_hash }));
    t.mock.method(User, 'findById', async () => ({ id: '10', role, status: 'active' }));
    t.mock.method(User, 'permissionsFor', async () => ['tours.read']);
    const touch = t.mock.method(User, 'touchLogin', async () => {});
    await assert.rejects(controller.loginOperations({ body: { email: 'person@example.com', password: 'Password123' } }, response()), { status: 401 });
    for (role of ['admin', 'staff']) {
        const res = response();
        await controller.loginOperations({ body: { email: 'person@example.com', password: 'Password123' } }, res);
        const config = getPortalConfig('operations');
        const payload = jwt.verify(res.body.data.token, config.secret, config.verifyOptions);
        assert.equal(payload.portal, 'operations');
        assert.equal(payload.aud, 'webquanlytour-operations');
        assert.equal(payload.exp - payload.iat, 2 * 60 * 60);
        assert.equal(res.body.data.user.role, role);
    }
    assert.equal(touch.mock.callCount(), 2);
});

test('Customer login vẫn hoạt động và chỉ nhận token Customer', async (t) => {
    const password_hash = await bcrypt.hash('Password123', 4);
    t.mock.method(User, 'findByEmail', async () => ({ id: '10', role: 'customer', status: 'active', password_hash }));
    t.mock.method(User, 'findById', async () => ({ id: '10', role: 'customer', status: 'active' }));
    t.mock.method(User, 'touchLogin', async () => {});
    const res = response();
    await controller.login({ body: { email: 'person@example.com', password: 'Password123' } }, res);
    const config = getPortalConfig('customer');
    const payload = jwt.verify(res.body.data.token, config.secret, config.verifyOptions);
    assert.equal(payload.portal, 'customer');
    assert.equal(payload.aud, 'webquanlytour-web');
    assert.throws(() => jwt.verify(res.body.data.token, getPortalConfig('operations').secret));
});

test('token khác cổng hoặc payload portal giả bị từ chối trước khi đọc tài khoản', async (t) => {
    const read = t.mock.method(User, 'findById', async () => { throw new Error('Không được đọc DB khi scope sai.'); });
    for (const [handler, value] of [
        [authenticateOperations, token('customer')],
        [authenticate, token('operations')],
        [authenticate, token('customer', { portal: 'operations' })],
        [authenticateOperations, token('operations', { portal: 'customer' })]
    ]) assert.equal((await authorize(handler, value)).error.status, 401);
    assert.equal(read.mock.callCount(), 0);
});

test('token Customer không thể nâng quyền sau khi role trong DB đổi sang Staff', async (t) => {
    t.mock.method(User, 'findById', async () => ({ id: '10', role: 'staff', status: 'active' }));
    assert.equal((await authorize(authenticate, token('customer'))).error.status, 401);
    assert.equal((await authorize(authenticateOperations, token('customer'))).error.status, 401);
});

test('token cũ thiếu portal và user Operations bị hạ vai trò hoặc khóa đều bị từ chối', async (t) => {
    let role = 'staff', status = 'active';
    t.mock.method(User, 'findById', async () => ({ id: '10', role, status }));
    t.mock.method(User, 'permissionsFor', async () => ['tours.read']);
    const signedToken = token('operations');
    assert.equal((await authorize(authenticateOperations, signedToken)).error, undefined);
    status = 'banned';
    assert.equal((await authorize(authenticateOperations, signedToken)).error.status, 401);
    status = 'active'; role = 'customer';
    assert.equal((await authorize(authenticateOperations, signedToken)).error.status, 401);
    const config = getPortalConfig('customer');
    const legacy = jwt.sign({}, config.secret, { subject: '10', issuer: config.issuer, audience: config.audience, expiresIn: '1h' });
    assert.equal((await authorize(authenticate, legacy)).error.status, 401);
});

test('phản hồi login chung cho email không tồn tại, sai mật khẩu và tài khoản bị khóa', async (t) => {
    const password_hash = await bcrypt.hash('Password123', 4);
    let account;
    t.mock.method(User, 'findByEmail', async () => account);
    const messages = [];
    for (const candidate of [undefined, { id: '10', role: 'staff', status: 'active', password_hash }, { id: '10', role: 'staff', status: 'banned', password_hash }]) {
        account = candidate;
        await assert.rejects(controller.loginOperations({ body: { email: 'person@example.com', password: 'WrongPassword123' } }, response()), (error) => {
            messages.push(error.message); return error.status === 401;
        });
    }
    assert.equal(new Set(messages).size, 1);
});

test('khóa Operations local được suy dẫn riêng, ổn định và không bằng JWT Customer', () => {
    const previous = process.env.INTERNAL_JWT_SECRET;
    delete process.env.INTERNAL_JWT_SECRET;
    try {
        const first = getPortalConfig('operations').secret;
        assert.ok(Buffer.isBuffer(first));
        assert.equal(first.length, 32);
        assert.deepEqual(first, getPortalConfig('operations').secret);
        assert.notEqual(first.toString('hex'), process.env.JWT_SECRET);
    } finally { process.env.INTERNAL_JWT_SECRET = previous; }
});

test('production không âm thầm suy dẫn khóa Operations khi thiếu khóa riêng', () => {
    const previousSecret = process.env.INTERNAL_JWT_SECRET;
    const previousMode = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.INTERNAL_JWT_SECRET;
    try { assert.throws(() => getPortalConfig('operations'), /INTERNAL_JWT_SECRET/); }
    finally {
        process.env.INTERNAL_JWT_SECRET = previousSecret;
        if (previousMode === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousMode;
    }
});
