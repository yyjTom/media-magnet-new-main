import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Ensure env is loaded here as well to avoid reading before injection
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
  charset: 'utf8mb4',
  // Enable TLS for managed databases when DB_SSL=true
  ...(String(process.env.DB_SSL).toLowerCase() === 'true'
    ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } }
    : {})
};

// Support DB_URL with TLS (e.g., TiDB Cloud)
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
    // TiDB Serverless requires TLS
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
  });
}

// 创建连接池
export const pool = process.env.DB_URL
  ? createPoolFromUrl(process.env.DB_URL)
  : mysql.createPool(dbConfig);

// Initialize database and tables
export async function initializeDatabase() {
  try {
    // In DB_URL/managed DB scenarios: CREATE DATABASE is usually not allowed; skip via DB_SKIP_CREATE=true
    if (!process.env.DB_URL && String(process.env.DB_SKIP_CREATE).toLowerCase() !== 'true') {
      const connection = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        // Local self-hosted MySQL may skip TLS
        ...(String(process.env.DB_SSL).toLowerCase() === 'true'
          ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } }
          : {})
      });
      await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
      console.log('Database media_magnet_users created or already exists');
      await connection.end();
    }

    // Use pool to connect to the database and create tables
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NULL,
        email_verified BOOLEAN DEFAULT FALSE,
        verification_code VARCHAR(6) NULL,
        verification_expires DATETIME NULL,
        google_id VARCHAR(255) NULL,
        avatar_url TEXT NULL,
        display_name VARCHAR(255) NULL,
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

    // Index optimization: improve history query performance
    try {
      await pool.execute('CREATE INDEX idx_user_website_history_user_created ON user_website_history (user_id, created_at)');
    } catch {}
    try {
      await pool.execute('CREATE INDEX idx_user_generation_history_user_created ON user_generation_history (user_id, created_at)');
    } catch {}

    // Add Google OAuth columns to existing users table if they don't exist
    try {
      await pool.execute('ALTER TABLE users MODIFY password VARCHAR(255) NULL');
    } catch {}
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN google_id VARCHAR(255) NULL');
    } catch {}
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN avatar_url TEXT NULL');
    } catch {}
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN display_name VARCHAR(255) NULL');
    } catch {}

    console.log('Tables and indexes ensured');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}
