import type { Context, Next } from 'hono';
import { redisService } from '../config/redis.js';


export function rateLimit({ keyPrefix, limit, windowSec }: { keyPrefix: string; limit: number; windowSec: number; }) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('cf-connecting-ip') || c.req.raw.headers.get('x-real-ip') || 'unknown'
    const key = `${keyPrefix}:${ip}`
    const current = parseInt((await redisService.get(key)) ?? '0', 10)
    if (current >= limit) {
      return c.json({ success: false, error: 'Too many requests' }, 429)
    }
    // increment + ttl atomically (simplificado)
    await redisService.set(key, String(current + 1), windowSec)
    return next()
  }
}
