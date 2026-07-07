import Koa from 'koa';
import chalk from 'chalk'
import http from 'http';
import fs from 'fs';
import path from 'path';
import { koaBody } from 'koa-body';
import setupRouter from './router';
import initializeSocket from './config/initializeSocket';
import initialMeeting from './config/meeting';
import { initDatabase } from './config/database';
import cors from '@/middleware/cors'

const app = new Koa();
const httpServer = http.createServer(app.callback())
const PORT = Number(process.env.PORT || 3000);

// 配置cors
app.use(cors)

// 配置请求体解析
app.use(koaBody({
  multipart: true,
  formidable: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
  }
}));

app.use(async (ctx, next) => {
  if (!ctx.path.startsWith('/uploads/')) return next();

  const uploadDir = path.join(process.cwd(), 'uploads');
  const filePath = path.resolve(uploadDir, `.${ctx.path.replace('/uploads', '')}`);

  if (!filePath.startsWith(uploadDir)) return next();
  if (!fs.existsSync(filePath)) return next();
  ctx.type = path.extname(filePath);
  ctx.body = fs.createReadStream(filePath);
});

// 启动服务器
async function startServer() {
  try {
    console.log(chalk.cyan.bold('\n========================================'));
    console.log(chalk.cyan.bold('  ToDesk 服务端启动中...'));
    console.log(chalk.cyan.bold('========================================\n'));

    // 1. 初始化数据库
    console.log(chalk.yellow('📦 正在初始化数据库...'));
    await initDatabase();
    console.log(chalk.green('✓ 数据库初始化完成\n'));

    // 2. 初始化Socket.IO
    console.log(chalk.yellow('🔌 正在初始化 Socket.IO...'));
    // initializeSocket(httpServer)
    initialMeeting(httpServer)
    console.log(chalk.green('✓ Socket.IO 初始化完成\n'));

    // 3. 注册路由
    console.log(chalk.yellow('🛣️  正在注册路由...'));
    setupRouter(app)
    console.log(chalk.green('✓ 路由注册完成\n'));

    // 4. 兜底响应（必须在路由注册之后）
    app.use(ctx => {
      ctx.status = 404;
      ctx.body = {
        code: 404,
        message: '未找到请求的资源',
        path: ctx.path
      };
    });

    // 5. 启动HTTP服务器
    httpServer.listen(PORT, () => {
      console.log(chalk.cyan.bold('========================================'));
      console.log(chalk.green.bold('✓ ToDesk 服务端启动成功！'));
      console.log(chalk.cyan.bold('========================================'));
      console.log(chalk.blue('  服务地址: ') + chalk.green.bold(`http://localhost:${PORT}`));
      console.log(chalk.blue('  环境: ') + chalk.yellow(process.env.NODE_ENV || 'development'));
      console.log(chalk.cyan.bold('========================================\n'));
    });
  } catch (error: any) {
    console.error(chalk.red.bold('\n✗ 服务端启动失败:'), error.message);
    console.error(chalk.red('详细错误:'), error);
    process.exit(1);
  }
}

startServer();
