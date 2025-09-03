import { z } from 'zod'
import dotenv from 'dotenv'
dotenv.config()

// Environment variables validation schema
export const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3010),

  // Database
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Redis
  REDIS_URL: z.string().url().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // Auth
  JWT_SECRET: z.string().min(32),
  // App URLs
  APP_REDIRECT_URL: z.string().url().optional(),
  POST_LOGOUT_REDIRECT_URL: z.string().url().optional(),

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
  JWT_SECRET,
  LOG_LEVEL,
  APP_REDIRECT_URL,
  POST_LOGOUT_REDIRECT_URL,
} = env
