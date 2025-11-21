import Koa from 'koa';
import chalk from 'chalk'
import http from 'http';
import setupRouter from './router';
import initializeSocket from './config/initializeSocket';
import initialMeeting from './config/meeting';
import cors from '@/middleware/cors'

const app = new Koa();

const httpServer = http.createServer(app.callback())

// 配置cors
app.use(cors)

// 初始化socket
initializeSocket(httpServer)
initialMeeting(httpServer)

console.log(chalk.green('---start-app---'))

// 注册路由
setupRouter(app)

// 兜底响应（如果没有路由匹配，则返回默认消息）
app.use(ctx => {
  ctx.body = 'TO DESK SERVER';
});

httpServer.listen(3000, () => {
  console.log(chalk.blue.bold('server running at:'), 'localhost:3000')
});