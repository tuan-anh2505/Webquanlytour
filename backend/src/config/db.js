// File: src/config/db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Bắn log ra console để xác nhận kết nối thành công
pool.getConnection()
    .then(connection => {
        console.log('Đã kết nối thành công tới MySQL!');
        connection.release();
    })
    .catch(err => {
        console.error('Lỗi kết nối MySQL: ', err.message);
    });

module.exports = pool;