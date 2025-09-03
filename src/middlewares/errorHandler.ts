import type { MiddlewareHandler } from 'hono'
import { formatError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

export const errorHandler: MiddlewareHandler = async (c, next) => {
  try {
    await next()
  } catch (error) {
    const errorResponse = formatError(error as Error)

    // Log the error
    logger.error({
      error: errorResponse,
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('User-Agent'),
      ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
    }, 'Request error')

    // Return error response
    const statusCode = (error as any).statusCode || 500
    return c.json(errorResponse, statusCode)
  }
}

// Development error handler with stack traces
export const devErrorHandler: MiddlewareHandler = async (c, next) => {
  try {
    await next()
  } catch (error) {
    const errorResponse = formatError(error as Error)

    // In development, include stack trace
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = (error as Error).stack
    }

    logger.error({
      error: errorResponse,
      method: c.req.method,
      path: c.req.path
    }, 'Request error')

    const statusCode = (error as any).statusCode || 500
    return c.json(errorResponse, statusCode)
  }
}
