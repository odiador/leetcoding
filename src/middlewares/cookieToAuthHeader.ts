import type { MiddlewareHandler } from 'hono';

export const cookieToAuthHeader: MiddlewareHandler = async (c, next) => {
  const cookie = c.req.header('cookie') ?? '';
  if (!c.req.header('Authorization')) {
    const match = cookie.match(/(?:^|;\s*)sb_access_token=([^;]+)/);
    if (match) {
      c.req.raw.headers.set('Authorization', `Bearer ${match[1]}`);
    }
  }
  await next();
};