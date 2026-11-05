const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const validate = require('../src/validators/tourValidator');

// Thay riêng dependency pool bằng stub trước khi nạp model: test không kết nối/ghi DB thật.
let calls = [];
let answers = [];
let fakeConnection;
const pool = {
    async query(sql, params) {
        calls.push({ sql, params });
        if (!answers.length) throw new Error('Thiếu dữ liệu stub cho truy vấn.');
        return [answers.shift()];
    },
    async getConnection() { return fakeConnection; }
};
const dbPath = require.resolve('../src/config/db');
const originalDbModule = require.cache[dbPath];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
const TourModel = require('../src/models/TourModel');
if (originalDbModule) require.cache[dbPath] = originalDbModule;
else delete require.cache[dbPath];

beforeEach(() => { calls = []; answers = []; fakeConnection = undefined; });

test('giới hạn phân trang và chặn dữ liệu query dạng mảng/SQL', () => {
    assert.equal(validate.listQuery({}).limit, 12);
    for (const query of [{ limit: '1000' }, { page: '1 OR 1=1' }, { q: ['tour'] }, { page: ['1'] }, { category_id: ['1'] }, { min_price: ['100'] }, { category_id: '1;DROP TABLE tours' }]) {
        assert.throws(() => validate.listQuery(query), { status: 400 });
    }
    assert.equal(validate.id('18446744073709551615'), '18446744073709551615');
    assert.throws(() => validate.id('18446744073709551616'), { status: 400 });
    assert.throws(() => validate.id(9007199254740992), { status: 400 });
});

test('kiểm tra tiền chính xác, loại tour và thứ tự khoảng lọc', () => {
    assert.equal(validate.listQuery({ min_price: '100.01', max_price: '100.02' }).min_price, '100.01');
    for (const query of [{ min_price: '-1' }, { max_price: '1e6' }, { min_price: '2', max_price: '1.99' }, { tour_type: 'vendor' }, { departure_from: '2028-03-02', departure_to: '2028-03-01' }]) {
        assert.throws(() => validate.listQuery(query), { status: 400 });
    }
});

test('bảo vệ trường nội bộ và kiểm tra quan hệ số ngày/số đêm', () => {
    assert.throws(() => validate.tour({ created_by: 1 }, true), { status: 400 });
    assert.throws(() => validate.schedule({ booked_seats: 0 }, true), { status: 400 });
    assert.throws(() => validate.validateMergedTour({ duration_days: 2, duration_nights: 3 }), { status: 400 });
    const value = validate.tour({ title: 'Đà Nẵng Hội An', base_price: '2000000', duration_days: 3 });
    assert.equal(value.slug, 'da-nang-hoi-an');
    assert.equal(validate.tour({ title: '2026', base_price: 0, duration_days: 1 }).slug, 'tour-2026');
    assert.throws(() => validate.tour({ slug: '2026' }, true), { status: 400 });
});

test('chặn URL ảnh thực thi mã và kiểm tra ngày có thực trên lịch', () => {
    for (const image_url of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', '//evil.example/image.jpg', '/\\evil.example/image.jpg']) {
        assert.throws(() => validate.image({ image_url }), { status: 400 });
    }
    assert.equal(validate.image({ image_url: 'https://example.com/tour.jpg', is_featured: true }).is_featured, 1);
    assert.throws(() => validate.schedule({ departure_date: '2027-02-29T08:00', max_capacity: 10 }), { status: 400 });
    assert.equal(validate.schedule({ departure_date: '2028-02-29T08:30', max_capacity: 10 }).departure_date, '2028-02-29 08:30:00');
    assert.equal(validate.schedule({ departure_date: '2028-02-29T01:30:00Z', max_capacity: 10 }).departure_date, '2028-02-29 08:30:00');
});

test('danh sách Guest luôn lọc active và từ khóa chỉ nằm trong tham số SQL', async () => {
    const malicious = "%' OR 1=1 --";
    answers = [[{ total: 1 }], [{ id: '4', status: 'active' }]];
    const result = await TourModel.list(validate.listQuery({ q: malicious, page: '2', limit: '10' }));
    assert.equal(result.meta.total, 1);
    for (const call of calls) {
        assert.match(call.sql, /t\.status = 'active'/);
        assert.ok(!call.sql.includes(malicious));
        assert.ok(call.params.includes(`%${malicious}%`));
    }
    assert.deepEqual(calls[1].params.slice(-2), [10, 10]);
});

test('không cho đọc tour nháp/ẩn qua ID hoặc endpoint lịch khởi hành', async () => {
    answers = [[]];
    await assert.rejects(TourModel.publicDetail('42'), { status: 404 });
    assert.match(calls[0].sql, /t\.status='active'/);
    assert.equal(calls.length, 1);
    calls = [];
    answers = [[]];
    await assert.rejects(TourModel.publicScheduleList('tour-an'), { status: 404 });
    assert.match(calls[0].sql, /status='active'/);
    assert.equal(calls.length, 1);
});

test('lịch Guest lọc lịch mở/tương lai và không chọn ghi chú/liên hệ nội bộ', async () => {
    answers = [[{ id: '5' }], []];
    const rows = await TourModel.publicScheduleList('5');
    assert.deepEqual(rows, []);
    const sql = calls[1].sql;
    assert.match(sql, /s\.status='open'/);
    assert.match(sql, /s\.departure_date >= CURRENT_TIMESTAMP/);
    assert.match(sql, /COALESCE\(s\.adult_price_override,t\.base_price\)/);
    assert.ok(!/notes|emergency_phone|transport_info|s\.\*/.test(sql));
});

test('khóa lịch trước khi giảm sức chứa và rollback nếu thấp hơn chỗ đã đặt', async () => {
    const events = [];
    fakeConnection = {
        async beginTransaction() { events.push('begin'); },
        async query(sql) {
            events.push(sql);
            if (sql.includes('FROM tours')) return [[{ id: '3' }]];
            if (sql.includes('FROM tour_schedules')) return [[{ id: '7', booked_seats: 5, max_capacity: 10, departure_date: '2028-03-01 08:00:00' }]];
            throw new Error('Không được ghi khi dữ liệu không hợp lệ.');
        },
        async commit() { events.push('commit'); },
        async rollback() { events.push('rollback'); },
        release() { events.push('release'); }
    };
    await assert.rejects(TourModel.saveSchedule('3', '7', { max_capacity: 4 }), { status: 400 });
    assert.ok(events.some(value => value.includes('FROM tour_schedules') && value.includes('FOR UPDATE')));
    assert.deepEqual(events.slice(-2), ['rollback', 'release']);
    assert.ok(!events.includes('commit'));
});

test('ảnh thuộc tour khác trả 404 trước khi thay đổi ảnh đại diện', async () => {
    const events = [];
    fakeConnection = {
        async beginTransaction() {},
        async query(sql) {
            events.push(sql);
            return sql.includes('FROM tours') ? [[{ id: '3' }]] : [[]];
        },
        async commit() { events.push('commit'); },
        async rollback() { events.push('rollback'); },
        release() { events.push('release'); }
    };
    await assert.rejects(TourModel.saveImage('3', '99', { is_featured: 1 }), { status: 404 });
    assert.ok(!events.some(value => value.startsWith('UPDATE')));
    assert.deepEqual(events.slice(-2), ['rollback', 'release']);
});

test('tạo hoặc sửa ngày lịch trình không được vượt quá số ngày của tour', async () => {
    for (const itineraryId of [null, '9']) {
        const events = [];
        fakeConnection = {
            async beginTransaction() { events.push('begin'); },
            async query(sql) {
                events.push(sql);
                if (sql.includes('FROM tours')) return [[{ id: '3', duration_days: 3 }]];
                if (sql.includes('FROM tour_itineraries')) return [[{ id: '9', day_number: 2 }]];
                throw new Error('Không được ghi lịch trình vượt số ngày của tour.');
            },
            async commit() { events.push('commit'); },
            async rollback() { events.push('rollback'); },
            release() { events.push('release'); }
        };
        await assert.rejects(TourModel.saveItinerary('3', itineraryId, { day_number: 4, title: 'Ngày thứ tư', content: 'Nội dung' }), { status: 400 });
        assert.ok(events.some(value => value.includes('FROM tours') && value.includes('FOR UPDATE')));
        assert.ok(!events.some(value => /^(INSERT|UPDATE)/.test(value)));
        assert.deepEqual(events.slice(-2), ['rollback', 'release']);
    }
});

test('không được giảm thời lượng tour nếu còn ngày lịch trình vượt số ngày mới', async () => {
    const events = [];
    fakeConnection = {
        async beginTransaction() { events.push('begin'); },
        async query(sql, params) {
            events.push(sql);
            if (sql.includes('FROM tours')) return [[{ id: '3', duration_days: 4, duration_nights: 1 }]];
            if (sql.includes('FROM tour_itineraries')) {
                assert.deepEqual(params, ['3', 2]);
                assert.match(sql, /day_number>\?/);
                assert.match(sql, /FOR UPDATE/);
                return [[{ day_number: 3 }]];
            }
            throw new Error('Không được cập nhật tour khi lịch trình chưa điều chỉnh.');
        },
        async commit() { events.push('commit'); },
        async rollback() { events.push('rollback'); },
        release() { events.push('release'); }
    };
    await assert.rejects(TourModel.update('3', { duration_days: 2 }), { status: 400 });
    assert.ok(!events.some(value => value.startsWith('UPDATE')));
    assert.deepEqual(events.slice(-2), ['rollback', 'release']);
});

test('vẫn cho phép ngày lịch trình bằng thời lượng và giảm thời lượng không làm mất ngày lịch trình', async () => {
    let committed = false;
    fakeConnection = {
        async beginTransaction() {},
        async query(sql) {
            if (sql.includes('FROM tours')) return [[{ id: '3', duration_days: 3 }]];
            if (sql.startsWith('INSERT INTO tour_itineraries')) return [{ insertId: '9' }];
            if (sql.includes('FROM tour_itineraries')) return [[{ id: '9', day_number: 3 }]];
            throw new Error('Truy vấn ngoài dự kiến.');
        },
        async commit() { committed = true; },
        async rollback() {},
        release() {}
    };
    const itinerary = await TourModel.saveItinerary('3', null, { day_number: 3, title: 'Ngày cuối', content: 'Nội dung' });
    assert.equal(itinerary.day_number, 3);
    assert.equal(committed, true);

    committed = false;
    fakeConnection.query = async sql => {
        if (sql.includes('FROM tour_itineraries')) return [[]];
        if (sql.startsWith('UPDATE tours')) return [{ affectedRows: 1 }];
        if (sql.includes('FROM tours')) return [[{ id: '3', duration_days: sql.includes('FOR UPDATE') ? 4 : 3, duration_nights: 1 }]];
        throw new Error('Truy vấn ngoài dự kiến.');
    };
    const tour = await TourModel.update('3', { duration_days: 3 });
    assert.equal(tour.duration_days, 3);
    assert.equal(committed, true);
});
