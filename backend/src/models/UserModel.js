const pool = require('../config/db');

// Danh sách cột an toàn dùng cho mọi API; password_hash chỉ được đọc khi đăng nhập.
const SAFE_COLUMNS = 'id, email, full_name, phone, role, status, email_verified_at, last_login_at, created_at, updated_at';

/** Tạo lỗi nghiệp vụ để middleware chung trả đúng HTTP status. */
function modelError(status, message) {
    return Object.assign(new Error(message), { status });
}

const User = {
    /** Tìm tài khoản kèm hash mật khẩu; chỉ dùng nội bộ cho xác thực. */
    async findByEmail(email) {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
        return rows[0];
    },

    /** Lưu tài khoản đã được hash; role mặc định customer, không lấy trực tiếp từ request. */
    async create({ email, password_hash, full_name, phone = null, role = 'customer' }) {
        const [result] = await pool.query(
            'INSERT INTO users (email, password_hash, full_name, phone, role) VALUES (?, ?, ?, ?, ?)',
            [email, password_hash, full_name, phone, role]
        );
        return result.insertId;
    },

    /** Đọc hồ sơ không có hash mật khẩu, dùng khi kiểm tra JWT và trả dữ liệu API. */
    async findById(id) {
        const [rows] = await pool.query(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [id]);
        return rows[0];
    },

    /** Đọc quyền được Admin cấp; middleware chỉ áp dụng danh sách này cho Staff. */
    async permissionsFor(id) {
        const [rows] = await pool.query('SELECT permission_key FROM staff_permissions WHERE user_id = ? ORDER BY permission_key', [id]);
        return rows.map(row => row.permission_key);
    },

    /** Ghi nhận lần đăng nhập thành công để quản trị theo dõi tài khoản. */
    async touchLogin(id) {
        await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    },

    /** Chỉ cập nhật tên và điện thoại của chính người dùng, không nhận role/status/email. */
    async updateProfile(id, { full_name, phone }) {
        await pool.query('UPDATE users SET full_name = ?, phone = ? WHERE id = ?', [full_name, phone, id]);
        return this.findById(id);
    },

    /** Phân trang tài khoản cho Admin, giữ các điều kiện tìm kiếm dưới dạng tham số SQL. */
    async list({ page, limit, q = '', role = '' }) {
        const clauses = [];
        const params = [];
        if (q) {
            clauses.push('(email LIKE ? OR full_name LIKE ? OR phone LIKE ?)');
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        if (role) { clauses.push('role = ?'); params.push(role); }
        const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
        const [count] = await pool.query(`SELECT COUNT(*) AS total FROM users${where}`, params);
        const [rows] = await pool.query(
            `SELECT ${SAFE_COLUMNS} FROM users${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
            [...params, limit, (page - 1) * limit]
        );
        return { rows, total: Number(count[0].total) };
    },

    /**
     * Admin sửa tài khoản trong transaction. Khóa tất cả Admin hoạt động theo cùng thứ tự
     * để hai yêu cầu đồng thời không thể cùng khóa/hạ quyền Admin cuối cùng.
     */
    async updateByAdmin(id, changes) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id FOR UPDATE");
            const [rows] = await connection.query(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ? FOR UPDATE`, [id]);
            const current = rows[0];
            if (!current) throw modelError(404, 'Không tìm thấy tài khoản.');
            const nextRole = changes.role ?? current.role;
            const nextStatus = changes.status ?? current.status;
            if (current.role === 'admin' && current.status === 'active' &&
                (nextRole !== 'admin' || nextStatus !== 'active') && admins.length <= 1) {
                throw modelError(409, 'Phải giữ lại ít nhất một Admin đang hoạt động.');
            }
            await connection.query('UPDATE users SET full_name = ?, phone = ?, role = ?, status = ? WHERE id = ?', [
                changes.full_name ?? current.full_name,
                Object.hasOwn(changes, 'phone') ? changes.phone : current.phone,
                nextRole, nextStatus, id
            ]);
            const [updated] = await connection.query(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`, [id]);
            await connection.commit();
            return updated[0];
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally { connection.release(); }
    },

    /** Thay thế quyền Staff theo yêu cầu rõ ràng của Admin; không xóa tài khoản hay dữ liệu tour. */
    async replacePermissions(id, permissions) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.query('SELECT id, role FROM users WHERE id = ? FOR UPDATE', [id]);
            if (!rows[0]) throw modelError(404, 'Không tìm thấy tài khoản.');
            if (rows[0].role !== 'staff') throw modelError(400, 'Chỉ cấp quyền chi tiết cho tài khoản Staff.');
            await connection.query('DELETE FROM staff_permissions WHERE user_id = ?', [id]);
            for (const permission of permissions) {
                await connection.query('INSERT INTO staff_permissions (user_id, permission_key) VALUES (?, ?)', [id, permission]);
            }
            await connection.commit();
            return permissions;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally { connection.release(); }
    }
};

module.exports = User;
