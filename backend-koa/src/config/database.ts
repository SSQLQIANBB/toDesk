import { Sequelize } from 'sequelize';
import mysql from 'mysql2/promise';

const DB_NAME = process.env.DB_NAME || 'todesk';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '123456'; // 修改为你的 MySQL 密码
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '3306');

// 创建数据库（如果不存在）
async function createDatabaseIfNotExists() {
  try {
    const connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
    });

    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    console.log(`✓ 数据库 "${DB_NAME}" 检查/创建完成`);
    
    await connection.end();
  } catch (error) {
    console.error('✗ 创建数据库失败:', error);
    throw error;
  }
}

// 使用 MySQL 配置
const sequelize = new Sequelize({
  database: DB_NAME,
  username: DB_USER,
  password: DB_PASSWORD,
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'mysql',
  logging: false,
  // 连接池配置
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  // 重试配置
  retry: {
    max: 3
  },
  // 字符集配置
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  }
});

export async function initDatabase() {
  try {
    // 1. 先创建数据库
    await createDatabaseIfNotExists();
    
    // 2. 连接数据库
    await sequelize.authenticate();
    console.log('✓ 数据库连接成功');
    
    // 3. 导入所有模型（确保模型已加载）
    await import('../models/User');
    await import('../models/Group');
    await import('../models/GroupMember');
    console.log('✓ 模型加载完成');
    
    // 4. 同步所有模型到数据库（创建表）
    await sequelize.sync({ alter: true });
    console.log('✓ 数据库表同步完成');
    
    // 5. 显示已创建的表
    const [tables]: any = await sequelize.query('SHOW TABLES');
    console.log('✓ 当前数据库表:', tables.map((t: any) => Object.values(t)[0]).join(', '));
    
  } catch (error: any) {
    console.error('✗ 数据库初始化失败:', error.message);
    
    // 提供详细的错误提示
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('  → MySQL 用户名或密码错误');
      console.error(`  → 当前配置: 用户=${DB_USER}, 密码=${DB_PASSWORD ? '******' : '(空)'}`);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('  → MySQL 服务未启动或连接被拒绝');
      console.error(`  → 当前配置: ${DB_HOST}:${DB_PORT}`);
    }
    
    throw error;
  }
}

export default sequelize;

