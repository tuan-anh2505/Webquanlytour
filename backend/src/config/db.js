const mysql = require('mysql2/promise');
require('./env');

// Dùng chung một pool cho các model; không tạo bảng, seed hoặc sửa dữ liệu khi import.
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 100,
    connectTimeout: 10000,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    timezone: '+07:00'
});

// DATETIME của lịch khởi hành dùng giờ Việt Nam. Cấu hình phiên kết nối không đổi dữ liệu/schema.
// Query được xếp hàng trước các truy vấn nghiệp vụ trên mỗi connection mới.
pool.on('connection', (connection) => {
    connection.query("SET SESSION time_zone = '+07:00'", (error) => {
        if (error) connection.destroy();
    });
});

module.exports = pool;
