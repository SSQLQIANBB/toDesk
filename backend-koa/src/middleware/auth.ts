import { Context, Next } from 'koa';
import { verifyToken } from '../utils/jwt';

export interface AuthState {
  user?: {
    userId: number;
    username: string;
  };
}

/**
 * JWT认证中间件
 */
export async function authMiddleware(ctx: Context, next: Next) {
  const token = ctx.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    ctx.status = 401;
    ctx.body = { error: '未提供认证token' };
    return;
  }

  try {
    const payload = verifyToken(token);
    ctx.state.user = payload;
    await next();
  } catch (error) {
    ctx.status = 401;
    ctx.body = { error: '无效的token' };
  }
}

/**
 * 可选的JWT认证中间件（token无效时不会拦截请求）
 */
export async function optionalAuthMiddleware(ctx: Context, next: Next) {
  const token = ctx.headers.authorization?.replace('Bearer ', '');

  if (token) {
    try {
      const payload = verifyToken(token);
      ctx.state.user = payload;
    } catch (error) {
      // token无效，但不拦截请求
    }
  }

  await next();
}

