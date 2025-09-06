import type { MiddlewareHandler } from 'hono'
import * as userService from '../services/user.service.js'
import { AuthenticationError } from '../utils/errors.js'

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

    // Let Supabase validate the token and return the user
    const { data, error } = await userService.getUserByAccessToken(token)
    if (error || !data?.user) {
      throw new AuthenticationError('Invalid token')
    }

    const user = data.user
    // Add user info to context
  c.set('userId', user.id)
  c.set('userEmail', user.email ?? '')
  c.set('tokenPayload', { userId: user.id, email: user.email ?? '' })

    await next()
  } catch (error) {
    if (error instanceof AuthenticationError) throw error
    throw new AuthenticationError((error as Error).message || 'Invalid token')
  }
}

// Optional auth middleware (doesn't throw if no token)
export const optionalAuthMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    const authHeader = c.req.header('Authorization')

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')

      if (token) {
        const { data, error } = await userService.getUserByAccessToken(token)
        if (data?.user && !error) {
          c.set('userId', data.user.id)
          c.set('userEmail', data.user.email ?? '')
          c.set('tokenPayload', { userId: data.user.id, email: data.user.email ?? '' })
        }
      }
    }

    await next()
  } catch (error) {
    // For optional auth, we don't throw errors
    await next()
  }
}
