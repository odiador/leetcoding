import type { MiddlewareHandler } from 'hono'
import { pino } from 'pino'

export const requestLogger = (logger: pino.Logger): MiddlewareHandler => {
  return async (c, next) => {
    const start = Date.now()
    const method = c.req.method
    const path = c.req.path

    logger.info({ method, path }, 'Request started')

    await next()

    const duration = Date.now() - start
    const status = c.res.status

    logger.info({ method, path, status, duration }, 'Request completed')
  }
}
