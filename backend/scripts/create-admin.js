const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const bcrypt = require('bcrypt');
const { validateEnvironment } = require('../src/config/env');
const pool = require('../src/config/db');

/** Tạo Admin đầu tiên qua nhập liệu trực tiếp; không có tài khoản/mật khẩu mặc định. */
async function createFirstAdmin() {
  validateEnvironment();
  if (!process.stdin.isTTY) throw new Error('Hãy chạy lệnh trong terminal tương tác để nhập mật khẩu an toàn.');
  let hideInput = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!hideInput) process.stdout.write(chunk);
      callback();
    }
  });
  const prompt = readline.createInterface({ input: process.stdin, output, terminal: true });
  let connection;
  try {
    const fullName = (await prompt.question('Họ tên Admin: ')).trim();
    const email = (await prompt.question('Email Admin: ')).trim().toLowerCase();
    process.stdout.write('Mật khẩu (ít nhất 8 ký tự, tối đa 72 byte, được ẩn): ');
    hideInput = true;
    const password = await prompt.question('');
    process.stdout.write('\nNhập lại mật khẩu: ');
    const confirmation = await prompt.question('');
    hideInput = false;
    process.stdout.write('\n');
    if (!fullName || fullName.length > 150 || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Họ tên hoặc email không hợp lệ.');
    }
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72 || password !== confirmation) {
      throw new Error('Mật khẩu cần ít nhất 8 ký tự, tối đa 72 byte và hai lần nhập phải khớp.');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin' AND status = 'active' FOR UPDATE");
    if (admins.length) throw new Error('Đã có Admin hoạt động. Hãy dùng trang quản trị để tạo/cấp quyền tài khoản.');
    await connection.execute(
      "INSERT INTO users (email, password_hash, full_name, role, status) VALUES (?, ?, ?, 'admin', 'active')",
      [email, passwordHash, fullName]
    );
    await connection.commit();
    console.log('Đã tạo Admin đầu tiên. Bạn có thể đăng nhập bằng thông tin vừa nhập.');
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    prompt.close();
    if (connection) connection.release();
  }
}

createFirstAdmin().catch((error) => {
  console.error(error.code ? `Không tạo được Admin (${error.code}).` : error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
