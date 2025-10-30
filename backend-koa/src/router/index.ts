import sseRouter from './sse';
import Router from 'koa-router';

export const apiRouter = new Router({
  prefix: '/api'
})

apiRouter.use('/sse', sseRouter.routes(), sseRouter.allowedMethods());

function setupRouter(app) {
  app.use(apiRouter.routes()).use(apiRouter.allowedMethods())
}

export default setupRouter;
