import { z } from 'zod'
import dotenv from 'dotenv'

if (process.env.NODE_ENV !== 'production')
  dotenv.config()

// Environment variables validation schema
export const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3010),

  // Database
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Redis
  REDIS_URL: z.url().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // Auth
  // App URLs
  API_URL: z.url().optional(),
  APP_REDIRECT_URL: z.url().optional(),
  POST_LOGOUT_REDIRECT_URL: z.url().optional(),
  CSRF_COOKIE: z.string().default('csrf_token'),
  // Refresh token ttl in days (used for Redis + cookie Max-Age)
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

// Parse and validate environment variables
export const env = envSchema.parse(process.env)

// Export individual variables for convenience
export const {
  NODE_ENV,
  PORT,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  REDIS_URL,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
  LOG_LEVEL,
  APP_REDIRECT_URL,
  POST_LOGOUT_REDIRECT_URL,
  API_URL,
  CSRF_COOKIE
} = env
