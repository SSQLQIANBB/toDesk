import Koa from 'koa';
import chalk from 'chalk'
import http from 'http';
import SseRouter from '@/router/sse';
import initializeSocket from './config/initializeSocket';

const app = new Koa();
const httpServer = http.createServer(app.callback())

// 初始化socket
initializeSocket(httpServer)

console.log(chalk.green('---start-app---'))


// 响应
app.use(ctx => {
  ctx.body = 'Hello Koa';
});

app.use(SseRouter.routes()).use(SseRouter.allowedMethods())

httpServer.listen(3000, () => {
  console.log(chalk.blue.bold('server running at:'), 'localhost:3000')
});