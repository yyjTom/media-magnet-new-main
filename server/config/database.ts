import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// 确保在该模块中也加载环境变量，避免被提前 import 时读不到配置
dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'media_magnet_users',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
  charset: 'utf8mb4'
};

// 兼容 TiDB Cloud/TLS：支持通过 DB_URL 指定完整连接串
function createPoolFromUrl(url: string) {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const port = Number(parsed.port || 3306);
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));

  return mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
    queueLimit: 0,
    charset: 'utf8mb4',
    // TiDB Serverless 需要 TLS
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
  });
}

// 创建连接池
export const pool = process.env.DB_URL
  ? createPoolFromUrl(process.env.DB_URL)
  : mysql.createPool(dbConfig);

// 初始化数据库和表
export async function initializeDatabase() {
  try {
    // DB_URL 场景通常已指定 database，且某些托管（如 PlanetScale/TiDB）限制创建库。
    // 允许通过 DB_SKIP_CREATE=true 跳过建库步骤。
    if (!process.env.DB_URL && String(process.env.DB_SKIP_CREATE).toLowerCase() !== 'true') {
      const connection = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password
      });
      await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
      console.log('数据库 media_magnet_users 创建成功或已存在');
      await connection.end();
    }

    // 现在使用连接池连接到新数据库并创建表
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email_verified BOOLEAN DEFAULT FALSE,
        verification_code VARCHAR(6) NULL,
        verification_expires DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;

    const createUserSessionsTable = `
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(500) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;

    const createWebsiteHistoryTable = `
      CREATE TABLE IF NOT EXISTS user_website_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;

    const createGenerationHistoryTable = `
      CREATE TABLE IF NOT EXISTS user_generation_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        url TEXT NOT NULL,
        payload LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;

    await pool.execute(createUsersTable);
    await pool.execute(createUserSessionsTable);
    await pool.execute(createWebsiteHistoryTable);
    await pool.execute(createGenerationHistoryTable);

    // 索引优化：提升历史查询性能
    try {
      await pool.execute('CREATE INDEX idx_user_website_history_user_created ON user_website_history (user_id, created_at)');
    } catch {}
    try {
      await pool.execute('CREATE INDEX idx_user_generation_history_user_created ON user_generation_history (user_id, created_at)');
    } catch {}

    console.log('用户表创建成功');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
}
