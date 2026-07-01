import { Sequelize } from 'sequelize';
import mysql from 'mysql2/promise';

const DB_NAME = process.env.DB_NAME || 'todesk';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '123456';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number.parseInt(process.env.DB_PORT || '3306', 10);

const DB_AUTO_CREATE = process.env.DB_AUTO_CREATE === 'true';
const DB_SYNC_ALTER = process.env.DB_SYNC_ALTER === 'true';

// 创建数据库（如果不存在）
async function createDatabaseIfNotExists() {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
       CHARACTER SET utf8mb4
       COLLATE utf8mb4_unicode_ci;`,
    );

    console.log(`✓ 数据库 "${DB_NAME}" 检查/创建完成`);
  } finally {
    await connection.end();
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
  logging: process.env.DB_LOGGING === 'true',
  // 连接池配置
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  retry: {
    max: 3,
  },
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  },
});

export async function initDatabase() {
  try {
    if (DB_AUTO_CREATE) {
      // 1. 先创建数据库
      await createDatabaseIfNotExists();
    }

    // 2. 连接数据库
    await sequelize.authenticate();
    console.log('✓ 数据库连接成功');

    // 加载所有模型以及模型关联
    await import('../models');
    console.log('✓ 模型加载完成');

    // 生产环境默认只创建缺失的表，不自动修改已有表结构
    await sequelize.sync({
      alter: DB_SYNC_ALTER,
    });

    console.log(
      DB_SYNC_ALTER
        ? '✓ 数据库表同步完成，已启用 alter'
        : '✓ 数据库表同步完成，未启用 alter',
    );

    // 5. 显示已创建的表
    const [tables]: any = await sequelize.query('SHOW TABLES');

    console.log(
      '✓ 当前数据库表:',
      tables.map((item: any) => Object.values(item)[0]).join(', '),
    );
  } catch (error: any) {
    console.error('✗ 数据库初始化失败:', error.message);

    if (error.original?.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error(`  → MySQL 用户名或密码错误，当前用户：${DB_USER}`);
    } else if (error.original?.code === 'ECONNREFUSED') {
      console.error(`  → 无法连接 MySQL：${DB_HOST}:${DB_PORT}`);
    } else if (error.original?.code === 'ER_BAD_DB_ERROR') {
      console.error(`  → 数据库不存在：${DB_NAME}`);
    }

    throw error;
  }
}

export default sequelize;