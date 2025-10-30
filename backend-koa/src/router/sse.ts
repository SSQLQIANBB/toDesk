import { PassThrough } from "stream";
import Router from 'koa-router';

const router = new Router();

router.get("/sse/connect", (ctx) => {
  ctx.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  ctx.body = 'test--sse'
  // ctx.set({
  //   "Content-Type": "text/event-stream",
  //   "Cache-Control": "no-cache",
  //   Connection: "keep-alive",
  // });
  // const stream = new PassThrough();
  // ctx.status = 200;

  // for (let i = 0; i < 5; i++) {
  //   setTimeout(() => {
  //     stream.write(`id: ${i}\n`);
  //     stream.write(
  //       `data: ${JSON.stringify({
  //         message: "Update from server",
  //       })}\n`
  //     );
  //     stream.write("retry: 1000\n");
  //     stream.write("\n\n");
  //   }, i * 1000);
  // }
  // ctx.body = stream;
});

export default router