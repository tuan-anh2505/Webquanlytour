// File: src/server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
require('./config/db'); // Gọi file db.js để kích hoạt kết nối MySQL

const app = express();

// Middlewares cơ bản
app.use(cors());
app.use(express.json()); // Cho phép backend đọc dữ liệu JSON từ Frontend

// Route kiểm tra hệ thống
app.get('/', (req, res) => {
    res.json({ message: 'Chào mừng đến với API Quản lý Tour!' });
});

// Khởi động server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Backend Server đang chạy tại http://localhost:${PORT}`);
});