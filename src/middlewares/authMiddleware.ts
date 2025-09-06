import type { Context, Next } from 'hono'
import { supabase } from '../config/supabase.js'
import { initRedis } from '../config/redis.js'
import { pino } from 'pino'
import { LOG_LEVEL } from '../config/env.js'
import jwt from 'jsonwebtoken'

const logger = pino({ level: LOG_LEVEL })

type CachedUser = {
  id: string
  email: string | null
  role?: string
}

function getTokenTTLSeconds(token: string): number {
  try {
    const decoded = jwt.decode(token) as { exp?: number } | null
    if (decoded?.exp) {
      const nowSec = Math.floor(Date.now() / 1000)
      // Leave a 30s buffer; clamp between 60s and 6h
      return Math.max(60, Math.min(decoded.exp - nowSec - 30, 6 * 60 * 60))
    }
  } catch {}
  // Fallback TTL: 5 minutes
  return 5 * 60
}

async function getCachedUser(token: string): Promise<CachedUser | null> {
  try {
    const client = await initRedis(logger)
    const raw = await client.get(`auth:token:${token}`)
    return raw ? (JSON.parse(raw) as CachedUser) : null
  } catch (err) {
    logger.debug({ err }, 'Redis get cache failed (auth)')
    return null
  }
}

async function setCachedUser(token: string, user: CachedUser, ttlSeconds: number): Promise<void> {
  try {
    const client = await initRedis(logger)
    await client.setEx(`auth:token:${token}`, ttlSeconds, JSON.stringify(user))
  } catch (err) {
    logger.debug({ err }, 'Redis set cache failed (auth)')
  }
}

export async function authMiddleware(c: Context, next: Next) {
  try {
    let token: string | undefined
    const authHeader = c.req.header('Authorization')

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim()
    } else {
      const cookieHeader = c.req.header('Cookie')
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').map(c => c.trim().split('='))
        const sbCookie = cookies.find(([name]) => name === 'sb_access_token')
        if (sbCookie) {
          token = sbCookie[1]
        }
      }
    }

    if (!token) {
      return c.json({ success: false, error: 'Missing or invalid token' }, 401)
    }

    // Try cache first
    const cached = await getCachedUser(token)
    if (cached) {
      c.set('userId', cached.id)
      c.set('userEmail', cached.email ?? undefined)
      c.set('userRole', cached.role ?? 'cliente')
      await next()
      return
    }

    // Verify the token with Supabase
    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401)
    }

    // Cache user briefly (until token expiry)
    const ttl = getTokenTTLSeconds(token)
    await setCachedUser(token, {
      id: data.user.id,
      email: data.user.email ?? null,
      role: data.user.user_metadata?.role ?? 'cliente'
    }, ttl)

    // Guardar datos en el contexto
    c.set('userId', data.user.id)
    c.set('userEmail', data.user.email)
    c.set('userRole', data.user.user_metadata?.role ?? 'cliente')

    await next()
  } catch (err) {
    return c.json(
      { success: false, error: err instanceof Error ? err.message : 'Auth failed' },
      401
    )
  }
}

// Optional auth middleware: if token present, validate with Supabase and set ctx, otherwise continue
export async function optionalAuthMiddleware(c: Context, next: Next) {
  try {
    let token: string | undefined
    const authHeader = c.req.header('Authorization')

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim()
    } else {
      const cookieHeader = c.req.header('Cookie')
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').map(c => c.trim().split('='))
        const sbCookie = cookies.find(([name]) => name === 'sb_access_token')
        if (sbCookie) {
          token = sbCookie[1]
        }
      }
    }

    if (token) {
      const cached = await getCachedUser(token)
      if (cached) {
        c.set('userId', cached.id)
        c.set('userEmail', cached.email ?? undefined)
        c.set('userRole', cached.role ?? 'cliente')
      } else {
        const { data, error } = await supabase.auth.getUser(token)
        if (!error && data.user) {
          const ttl = getTokenTTLSeconds(token)
          await setCachedUser(token, {
            id: data.user.id,
            email: data.user.email ?? null,
            role: data.user.user_metadata?.role ?? 'cliente'
          }, ttl)
          c.set('userId', data.user.id)
          c.set('userEmail', data.user.email)
          c.set('userRole', data.user.user_metadata?.role ?? 'cliente')
        }
      }
    }

    await next()
  } catch (err) {
    // Do not fail the request on optional auth errors
    await next()
  }
}
