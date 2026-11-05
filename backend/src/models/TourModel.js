const pool = require('../config/db');
const validator = require('../validators/tourValidator');

const TOUR_PUBLIC_COLUMNS = 't.id,t.category_id,t.title,t.slug,t.tour_type,t.summary,t.description,t.highlights,t.included_services,t.excluded_services,t.cancellation_policy,t.base_price,t.child_price,t.infant_price,t.departure_location,t.destination,t.duration_days,t.duration_nights,t.status,t.meta_title,t.meta_description,t.created_at,t.updated_at';
const TOUR_WRITE_FIELDS = ['category_id', 'title', 'slug', 'tour_type', 'summary', 'description', 'highlights', 'included_services', 'excluded_services', 'cancellation_policy', 'base_price', 'child_price', 'infant_price', 'departure_location', 'destination', 'duration_days', 'duration_nights', 'status', 'meta_title', 'meta_description', 'created_by'];
const SCHEDULE_WRITE_FIELDS = ['departure_date', 'return_date', 'meeting_point', 'meeting_time', 'transport_info', 'accommodation_info', 'emergency_phone', 'customer_instructions', 'max_capacity', 'adult_price_override', 'child_price_override', 'infant_price_override', 'status', 'notes'];

/** Tạo lỗi không tìm thấy, không tiết lộ tài nguyên thuộc tour khác. */
function notFound(message) {
    const error = new Error(message);
    error.status = 404;
    throw error;
}

/** Từ chối thay đổi làm lịch trình vượt quá số ngày của tour. */
function invalidItinerary(message) {
    const error = new Error(message);
    error.status = 400;
    throw error;
}

/** Chỉ đưa các cột được cho phép vào INSERT/UPDATE; mọi giá trị đều dùng placeholder. */
function writeData(data, allowed) {
    return Object.fromEntries(Object.entries(data).filter(([key, value]) => allowed.includes(key) && value !== undefined));
}

/** Chèn một bản ghi với tên bảng/cột do chương trình kiểm soát. */
async function insert(connection, table, data, allowed) {
    const clean = writeData(data, allowed);
    const columns = Object.keys(clean);
    const [result] = await connection.query(`INSERT INTO ${table} (${columns.map(key => `\`${key}\``).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, Object.values(clean));
    return String(result.insertId);
}

/** Cập nhật các trường được gửi; điều kiện WHERE luôn được truyền tham số riêng. */
async function update(connection, table, data, allowed, condition, params) {
    const clean = writeData(data, allowed);
    const columns = Object.keys(clean);
    if (!columns.length) return;
    await connection.query(`UPDATE ${table} SET ${columns.map(key => `\`${key}\` = ?`).join(',')} WHERE ${condition}`, [...Object.values(clean), ...params]);
}

/** Gói thay đổi liên quan trong một transaction và luôn giải phóng connection. */
async function transaction(work) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally { connection.release(); }
}

/** Xây điều kiện danh sách; API công khai luôn buộc trạng thái active ở tầng model. */
function buildFilters(filters, manage = false) {
    const clauses = [];
    const params = [];
    if (!manage) clauses.push("t.status = 'active'");
    else if (filters.status) { clauses.push('t.status = ?'); params.push(filters.status); }
    if (filters.q) { clauses.push('(t.title LIKE ? OR t.destination LIKE ? OR t.summary LIKE ?)'); const keyword = `%${filters.q}%`; params.push(keyword, keyword, keyword); }
    for (const key of ['category_id', 'tour_type']) if (filters[key]) { clauses.push(`t.${key} = ?`); params.push(filters[key]); }
    if (filters.destination) { clauses.push('t.destination LIKE ?'); params.push(`%${filters.destination}%`); }
    if (filters.min_price !== undefined) { clauses.push('t.base_price >= ?'); params.push(filters.min_price); }
    if (filters.max_price !== undefined) { clauses.push('t.base_price <= ?'); params.push(filters.max_price); }
    if (filters.departure_from || filters.departure_to) {
        const dates = ["s.tour_id = t.id", "s.status = 'open'", 's.departure_date >= CURRENT_TIMESTAMP'];
        if (filters.departure_from) { dates.push('s.departure_date >= ?'); params.push(filters.departure_from); }
        if (filters.departure_to) { dates.push('s.departure_date < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(filters.departure_to); }
        clauses.push(`EXISTS (SELECT 1 FROM tour_schedules s WHERE ${dates.join(' AND ')})`);
    }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

/** Đọc lịch mở trong tương lai, chỉ chọn dữ liệu công khai và tính giá/số chỗ hiệu lực. */
async function publicSchedules(tourId, connection = pool) {
    const [rows] = await connection.query(`SELECT s.id,s.tour_id,s.departure_date,s.return_date,s.max_capacity,s.booked_seats,
        (s.max_capacity-s.booked_seats) AS available_seats,s.status,
        COALESCE(s.adult_price_override,t.base_price) AS adult_price,
        COALESCE(s.child_price_override,t.child_price) AS child_price,
        COALESCE(s.infant_price_override,t.infant_price) AS infant_price
        FROM tour_schedules s JOIN tours t ON t.id=s.tour_id
        WHERE s.tour_id=? AND t.status='active' AND s.status='open' AND s.departure_date >= CURRENT_TIMESTAMP
        ORDER BY s.departure_date,s.id`, [tourId]);
    return rows;
}

/** Đọc danh sách ảnh và từng ngày lịch trình của một tour đã được kiểm tra quyền. */
async function content(tourId) {
    const [[images], [itineraries]] = await Promise.all([
        pool.query('SELECT id,tour_id,image_url,alt_text,sort_order,is_featured FROM tour_images WHERE tour_id=? ORDER BY sort_order,id', [tourId]),
        pool.query('SELECT id,tour_id,day_number,title,content FROM tour_itineraries WHERE tour_id=? ORDER BY day_number,id', [tourId])
    ]);
    return { images, itineraries };
}

const TourModel = {
    /** Đọc hồ sơ duy nhất của công ty, không tạo mô hình Vendor hoặc nhiều công ty. */
    async company() {
        const [rows] = await pool.query('SELECT id,company_name,logo_url,email,hotline,address,tax_code,introduction FROM company_profile WHERE id=1');
        return rows[0] || null;
    },

    /** Danh mục công khai cũng được dùng lại trong biểu mẫu quản trị. */
    async categories() {
        const [rows] = await pool.query('SELECT id,name,slug,description,created_at FROM categories ORDER BY name,id');
        return rows;
    },

    /** Tạo danh mục trên schema sẵn có; unique slug được DB bảo vệ. */
    async createCategory(data) {
        const categoryId = await insert(pool, 'categories', data, ['name', 'slug', 'description']);
        const [rows] = await pool.query('SELECT id,name,slug,description,created_at FROM categories WHERE id=?', [categoryId]);
        return rows[0];
    },

    /** Sửa danh mục, không xóa tour hoặc thay đổi liên kết dữ liệu khác. */
    async updateCategory(categoryId, data) {
        return transaction(async connection => {
            const [existing] = await connection.query('SELECT id FROM categories WHERE id=? FOR UPDATE', [categoryId]);
            if (!existing.length) notFound('Không tìm thấy danh mục.');
            await update(connection, 'categories', data, ['name', 'slug', 'description'], 'id=?', [categoryId]);
            const [rows] = await connection.query('SELECT id,name,slug,description,created_at FROM categories WHERE id=?', [categoryId]);
            return rows[0];
        });
    },

    /** Tìm kiếm/phân trang tour với SQL tham số; đếm bằng cùng bộ lọc với danh sách. */
    async list(filters, manage = false) {
        const { where, params } = buildFilters(filters, manage);
        const offset = (filters.page - 1) * filters.limit;
        const [counts] = await pool.query(`SELECT COUNT(*) AS total FROM tours t ${where}`, params);
        const [rows] = await pool.query(`SELECT ${TOUR_PUBLIC_COLUMNS},c.name AS category_name,
            (SELECT i.image_url FROM tour_images i WHERE i.tour_id=t.id ORDER BY i.is_featured DESC,i.sort_order,i.id LIMIT 1) AS featured_image_url,
            (SELECT MIN(s.departure_date) FROM tour_schedules s WHERE s.tour_id=t.id AND s.status='open' AND s.departure_date >= CURRENT_TIMESTAMP) AS next_departure_date
            FROM tours t LEFT JOIN categories c ON c.id=t.category_id ${where}
            ORDER BY t.created_at DESC,t.id DESC LIMIT ? OFFSET ?`, [...params, filters.limit, offset]);
        const total = Number(counts[0].total);
        return { data: rows, meta: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
    },

    /** Đọc chi tiết công khai bằng ID hoặc slug; draft/hidden luôn trả 404. */
    async publicDetail(identifier) {
        const lookup = /^\d+$/.test(identifier) ? 't.id=?' : 't.slug=?';
        const [rows] = await pool.query(`SELECT ${TOUR_PUBLIC_COLUMNS},c.name AS category_name FROM tours t LEFT JOIN categories c ON c.id=t.category_id WHERE ${lookup} AND t.status='active' LIMIT 1`, [identifier]);
        if (!rows.length) notFound('Không tìm thấy tour đang mở bán.');
        const tour = rows[0];
        const [details, schedules] = await Promise.all([content(tour.id), publicSchedules(tour.id)]);
        return { ...tour, ...details, schedules };
    },

    /** Đọc lịch riêng, vẫn xác minh tour active để không lộ tour ẩn qua endpoint phụ. */
    async publicScheduleList(identifier) {
        const lookup = /^\d+$/.test(identifier) ? 'id=?' : 'slug=?';
        const [rows] = await pool.query(`SELECT id FROM tours WHERE ${lookup} AND status='active' LIMIT 1`, [identifier]);
        if (!rows.length) notFound('Không tìm thấy tour đang mở bán.');
        return publicSchedules(rows[0].id);
    },

    /** Chi tiết quản trị; dữ liệu lịch nội bộ chỉ được đọc khi có quyền schedules.read. */
    async manageDetail(tourId, includeSchedules = false) {
        const [rows] = await pool.query('SELECT t.*,c.name AS category_name FROM tours t LEFT JOIN categories c ON c.id=t.category_id WHERE t.id=?', [tourId]);
        if (!rows.length) notFound('Không tìm thấy tour.');
        const [details, schedules] = await Promise.all([content(tourId), includeSchedules ? this.manageSchedules(tourId) : Promise.resolve([])]);
        return { ...rows[0], ...details, schedules };
    },

    /** Tạo tour, ghi nhận người tạo từ JWT và không cho client tự chọn created_by. */
    async create(data, actorId) {
        validator.validateMergedTour(data);
        const tourId = await insert(pool, 'tours', { ...data, created_by: actorId }, TOUR_WRITE_FIELDS);
        const [rows] = await pool.query('SELECT * FROM tours WHERE id=?', [tourId]);
        return rows[0];
    },

    /** Khóa tour trong lúc cập nhật để kiểm tra ngày/đêm trên dữ liệu mới nhất. */
    async update(tourId, data) {
        return transaction(async connection => {
            const [rows] = await connection.query('SELECT * FROM tours WHERE id=? FOR UPDATE', [tourId]);
            if (!rows.length) notFound('Không tìm thấy tour.');
            validator.validateMergedTour({ ...rows[0], ...data });
            if (data.duration_days !== undefined && Number(data.duration_days) < Number(rows[0].duration_days)) {
                // Khóa tour đã được giữ chung với saveItinerary để kiểm tra không bị lệch do cập nhật đồng thời.
                const [beyondDuration] = await connection.query('SELECT day_number FROM tour_itineraries WHERE tour_id=? AND day_number>? LIMIT 1 FOR UPDATE', [tourId, data.duration_days]);
                if (beyondDuration.length) invalidItinerary('Cần điều chỉnh lịch trình trước khi giảm số ngày của tour.');
            }
            await update(connection, 'tours', data, TOUR_WRITE_FIELDS.filter(key => key !== 'created_by'), 'id=?', [tourId]);
            const [result] = await connection.query('SELECT * FROM tours WHERE id=?', [tourId]);
            return result[0];
        });
    },

    /** Thêm/sửa ảnh với khóa tour chung để tránh hai ảnh đại diện do cập nhật đồng thời. */
    async saveImage(tourId, imageId, data) {
        return transaction(async connection => {
            const [parents] = await connection.query('SELECT id FROM tours WHERE id=? FOR UPDATE', [tourId]);
            if (!parents.length) notFound('Không tìm thấy tour.');
            if (imageId) {
                const [existing] = await connection.query('SELECT id FROM tour_images WHERE id=? AND tour_id=? FOR UPDATE', [imageId, tourId]);
                if (!existing.length) notFound('Không tìm thấy ảnh của tour.');
            }
            if (data.is_featured === 1) await connection.query('UPDATE tour_images SET is_featured=0 WHERE tour_id=? AND is_featured=1', [tourId]);
            if (imageId) await update(connection, 'tour_images', data, ['image_url', 'alt_text', 'sort_order', 'is_featured'], 'id=? AND tour_id=?', [imageId, tourId]);
            else imageId = await insert(connection, 'tour_images', { ...data, tour_id: tourId }, ['tour_id', 'image_url', 'alt_text', 'sort_order', 'is_featured']);
            const [rows] = await connection.query('SELECT id,tour_id,image_url,alt_text,sort_order,is_featured FROM tour_images WHERE id=? AND tour_id=?', [imageId, tourId]);
            return rows[0];
        });
    },

    /** Thêm/sửa một ngày lịch trình, không thay thế hoặc xóa các ngày còn lại. */
    async saveItinerary(tourId, itineraryId, data) {
        return transaction(async connection => {
            const [parents] = await connection.query('SELECT id,duration_days FROM tours WHERE id=? FOR UPDATE', [tourId]);
            if (!parents.length) notFound('Không tìm thấy tour.');
            if (itineraryId) {
                const [existing] = await connection.query('SELECT id,day_number FROM tour_itineraries WHERE id=? AND tour_id=? FOR UPDATE', [itineraryId, tourId]);
                if (!existing.length) notFound('Không tìm thấy lịch trình của tour.');
                if (Number(data.day_number ?? existing[0].day_number) > Number(parents[0].duration_days)) invalidItinerary('Ngày trong lịch trình không được vượt quá số ngày của tour.');
                await update(connection, 'tour_itineraries', data, ['day_number', 'title', 'content'], 'id=? AND tour_id=?', [itineraryId, tourId]);
            } else {
                if (Number(data.day_number) > Number(parents[0].duration_days)) invalidItinerary('Ngày trong lịch trình không được vượt quá số ngày của tour.');
                itineraryId = await insert(connection, 'tour_itineraries', { ...data, tour_id: tourId }, ['tour_id', 'day_number', 'title', 'content']);
            }
            const [rows] = await connection.query('SELECT id,tour_id,day_number,title,content FROM tour_itineraries WHERE id=? AND tour_id=?', [itineraryId, tourId]);
            return rows[0];
        });
    },

    /** Đọc lịch quản trị gồm giá override và ghi chú cho người có quyền đọc lịch. */
    async manageSchedules(tourId) {
        const [parents] = await pool.query('SELECT id FROM tours WHERE id=?', [tourId]);
        if (!parents.length) notFound('Không tìm thấy tour.');
        const [rows] = await pool.query(`SELECT s.*,(s.max_capacity-s.booked_seats) AS available_seats,
            COALESCE(s.adult_price_override,t.base_price) AS adult_price,
            COALESCE(s.child_price_override,t.child_price) AS child_price,
            COALESCE(s.infant_price_override,t.infant_price) AS infant_price
            FROM tour_schedules s JOIN tours t ON t.id=s.tour_id WHERE s.tour_id=? ORDER BY s.departure_date,s.id`, [tourId]);
        return rows;
    },

    /** Tạo/sửa lịch cơ bản; khóa bản ghi trước khi kiểm tra sức chứa, không sửa booked_seats. */
    async saveSchedule(tourId, scheduleId, data) {
        return transaction(async connection => {
            const [parents] = await connection.query('SELECT id FROM tours WHERE id=? FOR UPDATE', [tourId]);
            if (!parents.length) notFound('Không tìm thấy tour.');
            if (scheduleId) {
                const [existing] = await connection.query('SELECT * FROM tour_schedules WHERE id=? AND tour_id=? FOR UPDATE', [scheduleId, tourId]);
                if (!existing.length) notFound('Không tìm thấy lịch khởi hành của tour.');
                validator.validateMergedSchedule({ ...existing[0], ...data });
                await update(connection, 'tour_schedules', data, SCHEDULE_WRITE_FIELDS, 'id=? AND tour_id=?', [scheduleId, tourId]);
            } else {
                validator.validateMergedSchedule(data);
                scheduleId = await insert(connection, 'tour_schedules', { ...data, tour_id: tourId }, ['tour_id', ...SCHEDULE_WRITE_FIELDS]);
            }
            const [rows] = await connection.query('SELECT * FROM tour_schedules WHERE id=? AND tour_id=?', [scheduleId, tourId]);
            return rows[0];
        });
    }
};

module.exports = TourModel;
