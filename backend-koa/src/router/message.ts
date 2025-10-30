import Router from 'koa-router'

const router = new Router({
  prefix: '/api'
})

router.get('/message/page', (ctx, next) => {
  ctx.body = 'test message'
})

export default router;