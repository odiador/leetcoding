import type { MiddlewareHandler } from 'hono'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../config/env'
import { AuthenticationError } from '../utils/errors'

interface JWTPayload {
  userId: string
  email: string
  iat?: number
  exp?: number
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    const authHeader = c.req.header('Authorization')

    if (!authHeader) {
      throw new AuthenticationError('No authorization header provided')
    }

    const token = authHeader.replace('Bearer ', '')

    if (!token) {
      throw new AuthenticationError('No token provided')
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload

    // Add user info to context
    c.set('userId', decoded.userId)
    c.set('userEmail', decoded.email)
    c.set('tokenPayload', decoded)

    await next()
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token')
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token expired')
    }
    throw error
  }
}

// Optional auth middleware (doesn't throw if no token)
export const optionalAuthMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    const authHeader = c.req.header('Authorization')

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')

      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
        c.set('userId', decoded.userId)
        c.set('userEmail', decoded.email)
        c.set('tokenPayload', decoded)
      }
    }

    await next()
  } catch (error) {
    // For optional auth, we don't throw errors
    await next()
  }
}
