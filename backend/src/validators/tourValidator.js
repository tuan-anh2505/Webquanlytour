/** Kiểm tra dữ liệu danh mục, tour và lịch khởi hành trước khi truy vấn MySQL. */
const MAX_ID = 18446744073709551615n;

/** Tạo lỗi dữ liệu đầu vào có mã HTTP để middleware chung trả phản hồi nhất quán. */
function invalid(message) {
    const error = new Error(message);
    error.status = 400;
    throw error;
}

/** Giữ ID BIGINT dưới dạng chuỗi để không mất chính xác khi vượt giới hạn Number. */
function id(value, label = 'ID') {
    if (!['string', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isSafeInteger(value))) invalid(`${label} không hợp lệ; ID lớn phải gửi dưới dạng chuỗi.`);
    const text = String(value ?? '');
    if (!/^[1-9]\d{0,19}$/.test(text) || BigInt(text) > MAX_ID) invalid(`${label} không hợp lệ.`);
    return text;
}

/** Kiểm tra số nguyên trong giới hạn của trường dữ liệu hoặc phân trang. */
function integer(value, label, min, max) {
    if (!['string', 'number'].includes(typeof value)) invalid(`${label} phải là một số nguyên.`);
    if (!/^(0|[1-9]\d*)$/.test(String(value))) invalid(`${label} phải là số nguyên từ ${min} đến ${max}.`);
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < min || number > max) invalid(`${label} phải từ ${min} đến ${max}.`);
    return number;
}

/** Kiểm tra tiền DECIMAL(12,2), không chấp nhận số âm hoặc ký pháp số mũ. */
function money(value, label) {
    if (!['string', 'number'].includes(typeof value)) invalid(`${label} phải là số tiền.`);
    const text = String(value ?? '');
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) invalid(`${label} phải là số tiền không âm, tối đa 2 chữ số thập phân.`);
    return text;
}

/** Đổi tiền sang xu bằng BigInt để so sánh mà không làm tròn số thập phân. */
function cents(value) {
    const [whole, fraction = ''] = String(value).split('.');
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/** Chuẩn hóa chuỗi, giới hạn độ dài và phân biệt trường bắt buộc/trường nullable. */
function text(value, label, max, required = false, nullable = true) {
    if (value === null && nullable && !required) return null;
    if (typeof value !== 'string') invalid(`${label} phải là chuỗi.`);
    const normalized = value.trim();
    if ((required && !normalized) || [...normalized].length > max) invalid(`${label} ${required ? 'không được trống và ' : ''}tối đa ${max} ký tự.`);
    return normalized || (nullable ? null : '');
}

/** Tạo slug tiếng Việt dễ đọc khi người quản trị chưa nhập slug riêng. */
function makeSlug(value) {
    const result = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 240).replace(/-$/g, '');
    return /^\d+$/.test(result) ? `tour-${result}` : result;
}

/** Slug chỉ chứa ký tự an toàn và không toàn số để tránh nhầm với ID của tour. */
function slug(value, max) {
    const result = text(value, 'Slug', max, true, false);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result) || /^\d+$/.test(result)) invalid('Slug phải chứa chữ thường, số và dấu gạch nối; không được chỉ gồm số.');
    return result;
}

/** Chỉ cho phép các trường đã công bố, tránh sửa ID, người tạo hoặc số chỗ đã đặt. */
function object(body, allowed) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Dữ liệu phải là đối tượng JSON.');
    for (const key of Object.keys(body)) if (!allowed.includes(key)) invalid(`Trường ${key} không được phép cập nhật.`);
    return body;
}

/** Kiểm tra ngày thực có trên lịch, tránh JavaScript tự đổi 31/02 sang tháng sau. */
function calendarDate(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${label} phải có dạng YYYY-MM-DD.`);
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value || Number(value.slice(0, 4)) < 1000) invalid(`${label} không hợp lệ.`);
    return value;
}

/** Nhận datetime-local theo giờ Việt Nam; ISO có múi giờ được chuyển về UTC+7. */
function dateTime(value, label) {
    if (typeof value !== 'string') invalid(`${label} phải là ngày giờ.`);
    const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
    if (!match) invalid(`${label} phải có dạng YYYY-MM-DDTHH:mm.`);
    calendarDate(match[1], label);
    if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] || 0) > 59) invalid(`${label} không hợp lệ.`);
    if (match[5]) {
        const instant = new Date(value.replace(' ', 'T'));
        if (Number.isNaN(instant.valueOf())) invalid(`${label} không hợp lệ.`);
        const local = new Date(instant.valueOf() + 7 * 3600000);
        if (local.getUTCFullYear() < 1000 || local.getUTCFullYear() > 9999) invalid(`${label} nằm ngoài khoảng ngày MySQL hỗ trợ.`);
        return local.toISOString().slice(0, 19).replace('T', ' ');
    }
    return `${match[1]} ${match[2]}:${match[3]}:${match[4] || '00'}`;
}

/** Kiểm tra bộ lọc danh sách và giới hạn phân trang để truy vấn luôn có giới hạn. */
function listQuery(query, manage = false) {
    const result = { page: query.page === undefined ? 1 : integer(query.page, 'Trang', 1, 1000000), limit: query.limit === undefined ? 12 : integer(query.limit, 'Số tour mỗi trang', 1, 100) };
    if (query.q !== undefined) result.q = text(query.q, 'Từ khóa', 200, false, false);
    if (query.category_id !== undefined && query.category_id !== '') result.category_id = id(query.category_id, 'Danh mục');
    if (query.destination !== undefined) result.destination = text(query.destination, 'Điểm đến', 255, false, false);
    if (query.tour_type !== undefined && query.tour_type !== '') {
        if (!['domestic', 'international'].includes(query.tour_type)) invalid('Loại tour không hợp lệ.');
        result.tour_type = query.tour_type;
    }
    for (const key of ['min_price', 'max_price']) if (query[key] !== undefined && query[key] !== '') result[key] = money(query[key], 'Giá lọc');
    if (result.min_price !== undefined && result.max_price !== undefined && cents(result.min_price) > cents(result.max_price)) invalid('Giá tối thiểu không được lớn hơn giá tối đa.');
    for (const key of ['departure_from', 'departure_to']) if (query[key] !== undefined && query[key] !== '') result[key] = calendarDate(query[key], 'Ngày khởi hành');
    if (result.departure_from && result.departure_to && result.departure_from > result.departure_to) invalid('Khoảng ngày khởi hành không hợp lệ.');
    if (manage && query.status !== undefined && query.status !== '') {
        if (!['draft', 'active', 'hidden'].includes(query.status)) invalid('Trạng thái tour không hợp lệ.');
        result.status = query.status;
    }
    return result;
}

/** Kiểm tra tên/slug danh mục; PATCH chỉ cập nhật các trường được gửi. */
function category(body, partial = false) {
    object(body, ['name', 'slug', 'description']);
    const result = {};
    if (!partial || body.name !== undefined) result.name = text(body.name, 'Tên danh mục', 100, true, false);
    if (body.slug !== undefined) result.slug = slug(body.slug, 150);
    else if (!partial) result.slug = slug(makeSlug(result.name).slice(0, 150).replace(/-$/g, ''), 150);
    if (body.description !== undefined) result.description = text(body.description, 'Mô tả danh mục', 10000);
    if (!Object.keys(result).length) invalid('Chưa có dữ liệu danh mục để cập nhật.');
    return result;
}

const TOUR_TEXT_FIELDS = { title: 255, summary: 500, description: 100000, highlights: 15000, included_services: 15000, excluded_services: 15000, cancellation_policy: 15000, departure_location: 200, destination: 255, meta_title: 255, meta_description: 500 };
const TOUR_FIELDS = [...Object.keys(TOUR_TEXT_FIELDS), 'slug', 'category_id', 'tour_type', 'base_price', 'child_price', 'infant_price', 'duration_days', 'duration_nights', 'status'];

/** Kiểm tra tour; các ràng buộc liên trường được kiểm tra lại với dữ liệu cũ khi PATCH. */
function tour(body, partial = false) {
    object(body, TOUR_FIELDS);
    const result = {};
    for (const [key, max] of Object.entries(TOUR_TEXT_FIELDS)) if (body[key] !== undefined || (!partial && key === 'title')) result[key] = text(body[key], key, max, key === 'title', key !== 'title');
    if (body.slug !== undefined) result.slug = slug(body.slug, 255);
    else if (!partial) result.slug = slug(makeSlug(result.title), 255);
    if (body.category_id !== undefined) result.category_id = body.category_id === null || body.category_id === '' ? null : id(body.category_id, 'Danh mục');
    for (const key of ['base_price', 'child_price', 'infant_price']) if (body[key] !== undefined || (!partial && key === 'base_price')) result[key] = money(body[key], key);
    if (body.duration_days !== undefined || !partial) result.duration_days = integer(body.duration_days, 'Số ngày', 1, 65535);
    if (body.duration_nights !== undefined) result.duration_nights = integer(body.duration_nights, 'Số đêm', 0, 65535);
    if (body.tour_type !== undefined) {
        if (!['domestic', 'international'].includes(body.tour_type)) invalid('Loại tour không hợp lệ.');
        result.tour_type = body.tour_type;
    }
    if (body.status !== undefined) {
        if (!['draft', 'active', 'hidden'].includes(body.status)) invalid('Trạng thái tour không hợp lệ.');
        result.status = body.status;
    }
    if (!Object.keys(result).length) invalid('Chưa có dữ liệu tour để cập nhật.');
    return result;
}

/** Chặn URL ảnh có mã thực thi, URL dạng // hoặc đường dẫn chứa ký tự điều khiển. */
function imageUrl(value) {
    const url = text(value, 'Đường dẫn ảnh', 1024, true, false);
    if (/[\x00-\x20\\]/.test(url)) invalid('Đường dẫn ảnh không hợp lệ.');
    if (url.startsWith('/') && !url.startsWith('//')) return url;
    try { const parsed = new URL(url); if (['http:', 'https:'].includes(parsed.protocol) && parsed.hostname && !parsed.username && !parsed.password) return url; } catch {}
    invalid('Ảnh phải dùng URL http/https hoặc đường dẫn bắt đầu bằng /.');
}

/** Kiểm tra ảnh tour và thứ tự hiển thị, giữ nguyên ảnh khác khi chỉnh sửa. */
function image(body, partial = false) {
    object(body, ['image_url', 'alt_text', 'sort_order', 'is_featured']);
    const result = {};
    if (body.image_url !== undefined || !partial) result.image_url = imageUrl(body.image_url);
    if (body.alt_text !== undefined) result.alt_text = text(body.alt_text, 'Mô tả ảnh', 255);
    if (body.sort_order !== undefined) result.sort_order = integer(body.sort_order, 'Thứ tự ảnh', 0, 4294967295);
    if (body.is_featured !== undefined) {
        if (![true, false, 0, 1].includes(body.is_featured)) invalid('Ảnh đại diện phải là boolean.');
        result.is_featured = body.is_featured ? 1 : 0;
    }
    if (!Object.keys(result).length) invalid('Chưa có dữ liệu ảnh để cập nhật.');
    return result;
}

/** Kiểm tra nội dung từng ngày trong lịch trình tour. */
function itinerary(body, partial = false) {
    object(body, ['day_number', 'title', 'content']);
    const result = {};
    if (body.day_number !== undefined || !partial) result.day_number = integer(body.day_number, 'Ngày trong lịch trình', 1, 65535);
    if (body.title !== undefined || !partial) result.title = text(body.title, 'Tên lịch trình', 255, true, false);
    if (body.content !== undefined || !partial) result.content = text(body.content, 'Nội dung lịch trình', 100000, true, false);
    if (!Object.keys(result).length) invalid('Chưa có dữ liệu lịch trình để cập nhật.');
    return result;
}

const SCHEDULE_TEXT_FIELDS = { meeting_point: 255, transport_info: 15000, accommodation_info: 15000, emergency_phone: 25, customer_instructions: 15000, notes: 15000 };

/** Kiểm tra lịch khởi hành cơ bản; số chỗ đã đặt chỉ do nghiệp vụ booking cập nhật. */
function schedule(body, partial = false) {
    object(body, [...Object.keys(SCHEDULE_TEXT_FIELDS), 'departure_date', 'return_date', 'meeting_time', 'max_capacity', 'adult_price_override', 'child_price_override', 'infant_price_override', 'status']);
    const result = {};
    if (body.departure_date !== undefined || !partial) result.departure_date = dateTime(body.departure_date, 'Ngày khởi hành');
    for (const key of ['return_date', 'meeting_time']) if (body[key] !== undefined) result[key] = body[key] === null || body[key] === '' ? null : dateTime(body[key], key);
    if (body.max_capacity !== undefined || !partial) result.max_capacity = integer(body.max_capacity, 'Số chỗ tối đa', 1, 4294967295);
    for (const key of ['adult_price_override', 'child_price_override', 'infant_price_override']) if (body[key] !== undefined) result[key] = body[key] === null || body[key] === '' ? null : money(body[key], key);
    for (const [key, max] of Object.entries(SCHEDULE_TEXT_FIELDS)) if (body[key] !== undefined) result[key] = text(body[key], key, max);
    if (body.status !== undefined) {
        if (!['open', 'closed', 'cancelled'].includes(body.status)) invalid('Trạng thái lịch khởi hành không hợp lệ.');
        result.status = body.status;
    }
    if (!Object.keys(result).length) invalid('Chưa có dữ liệu lịch khởi hành để cập nhật.');
    return result;
}

/** Bảo vệ ràng buộc ngày/đêm và lịch khởi hành sau khi ghép dữ liệu PATCH với bản cũ. */
function validateMergedTour(value) {
    if (Number(value.duration_nights || 0) > Number(value.duration_days)) invalid('Số đêm không được lớn hơn số ngày.');
}

/** Kiểm tra sức chứa và thứ tự các mốc thời gian trên lịch đã ghép đầy đủ. */
function validateMergedSchedule(value) {
    if (value.return_date && value.return_date < value.departure_date) invalid('Ngày về không được trước ngày khởi hành.');
    if (value.meeting_time && value.meeting_time > value.departure_date) invalid('Giờ tập trung không được sau giờ khởi hành.');
    if (Number(value.max_capacity) < Number(value.booked_seats || 0)) invalid('Số chỗ tối đa không được nhỏ hơn số chỗ đã đặt.');
}

module.exports = { id, listQuery, category, tour, image, itinerary, schedule, validateMergedTour, validateMergedSchedule, makeSlug, slug, imageUrl };
