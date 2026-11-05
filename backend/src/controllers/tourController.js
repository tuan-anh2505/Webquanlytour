const TourModel = require('../models/TourModel');
const validate = require('../validators/tourValidator');

/** Chấp nhận ID BIGINT hoặc slug; chặn tham số bất thường trước khi gọi model. */
function identifier(value) {
    if (/^\d+$/.test(value)) return validate.id(value, 'Tour');
    if (typeof value !== 'string' || value.length > 255 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
        const error = new Error('ID hoặc slug tour không hợp lệ.');
        error.status = 400;
        throw error;
    }
    return value;
}

/** Admin đọc toàn bộ lịch; Staff phải được cấp quyền schedules.read riêng. */
function canReadSchedules(user) {
    return user.role === 'admin' || (user.permissions || []).includes('schedules.read');
}

module.exports = {
    /** Guest đọc thông tin công ty duy nhất mà không cần đăng nhập. */
    async company(req, res) { res.json({ data: await TourModel.company() }); },

    /** Danh mục công khai dùng cho bộ lọc tour và biểu mẫu quản trị. */
    async categories(req, res) { res.json({ data: await TourModel.categories() }); },

    /** Tạo danh mục sau khi route đã kiểm tra quyền categories.write. */
    async createCategory(req, res) { res.status(201).json({ data: await TourModel.createCategory(validate.category(req.body)) }); },

    /** Sửa danh mục theo ID, không thao tác xóa dữ liệu. */
    async updateCategory(req, res) { res.json({ data: await TourModel.updateCategory(validate.id(req.params.id, 'Danh mục'), validate.category(req.body, true)) }); },

    /** Guest tìm kiếm tour active; mọi bộ lọc được kiểm tra và đưa vào SQL tham số. */
    async listPublic(req, res) { res.json(await TourModel.list(validate.listQuery(req.query), false)); },

    /** Chi tiết tour công khai có ảnh, lịch trình và các lịch mở trong tương lai. */
    async detailPublic(req, res) { res.json({ data: await TourModel.publicDetail(identifier(req.params.idOrSlug)) }); },

    /** Xem lịch khởi hành công khai, không trả ghi chú hoặc liên hệ nội bộ. */
    async schedulesPublic(req, res) { res.json({ data: await TourModel.publicScheduleList(identifier(req.params.idOrSlug)) }); },

    /** Người có quyền tours.read xem cả tour nháp/ẩn trong danh sách quản trị. */
    async listManage(req, res) { res.json(await TourModel.list(validate.listQuery(req.query, true), true)); },

    /** Chi tiết quản trị với dữ liệu lịch được giới hạn theo quyền của người đọc. */
    async detailManage(req, res) { res.json({ data: await TourModel.manageDetail(validate.id(req.params.id, 'Tour'), canReadSchedules(req.user)) }); },

    /** Tạo tour gắn người tạo từ phiên đăng nhập, không nhận created_by từ client. */
    async createTour(req, res) { res.status(201).json({ data: await TourModel.create(validate.tour(req.body), req.user.id) }); },

    /** Sửa các trường được phép của tour; dùng status để ngừng công khai tour. */
    async updateTour(req, res) { res.json({ data: await TourModel.update(validate.id(req.params.id, 'Tour'), validate.tour(req.body, true)) }); },

    /** Thêm ảnh tour bằng URL, không thay thế các ảnh đã tồn tại. */
    async createImage(req, res) { res.status(201).json({ data: await TourModel.saveImage(validate.id(req.params.id, 'Tour'), null, validate.image(req.body)) }); },

    /** Sửa đúng ảnh thuộc tour, có transaction bảo vệ ảnh đại diện. */
    async updateImage(req, res) { res.json({ data: await TourModel.saveImage(validate.id(req.params.id, 'Tour'), validate.id(req.params.imageId, 'Ảnh'), validate.image(req.body, true)) }); },

    /** Thêm một ngày trong lịch trình tour. */
    async createItinerary(req, res) { res.status(201).json({ data: await TourModel.saveItinerary(validate.id(req.params.id, 'Tour'), null, validate.itinerary(req.body)) }); },

    /** Chỉnh sửa một ngày lịch trình đã có. */
    async updateItinerary(req, res) { res.json({ data: await TourModel.saveItinerary(validate.id(req.params.id, 'Tour'), validate.id(req.params.itineraryId, 'Lịch trình'), validate.itinerary(req.body, true)) }); },

    /** Đọc lịch đầy đủ cho người có quyền schedules.read. */
    async schedulesManage(req, res) { res.json({ data: await TourModel.manageSchedules(validate.id(req.params.id, 'Tour')) }); },

    /** Tạo lịch khởi hành cơ bản; nghiệp vụ giữ chỗ được triển khai ở Giai đoạn 2. */
    async createSchedule(req, res) { res.status(201).json({ data: await TourModel.saveSchedule(validate.id(req.params.id, 'Tour'), null, validate.schedule(req.body)) }); },

    /** Sửa lịch và giá riêng, không nhận số chỗ đã đặt do client gửi. */
    async updateSchedule(req, res) { res.json({ data: await TourModel.saveSchedule(validate.id(req.params.id, 'Tour'), validate.id(req.params.scheduleId, 'Lịch khởi hành'), validate.schedule(req.body, true)) }); }
};
