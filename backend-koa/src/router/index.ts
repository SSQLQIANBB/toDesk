import sseRouter from './sse';
import chatRouter from './chat';
import Router from 'koa-router';

export const apiRouter = new Router({
  prefix: '/api'
})

// 注册各个子路由
apiRouter.use('/sse', sseRouter.routes(), sseRouter.allowedMethods());
apiRouter.use('/chat', chatRouter.routes(), chatRouter.allowedMethods());

function setupRouter(app) {
  // 注册路由
  app.use(apiRouter.routes()).use(apiRouter.allowedMethods())
}

export default setupRouter;
