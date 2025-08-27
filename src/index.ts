import { serve } from '@hono/node-server'
import dotenv from 'dotenv'
import { Hono } from 'hono'
import type { RedisClientType } from 'redis'
import { createClient } from 'redis'
import { pino } from 'pino'
import * as promClient from 'prom-client'

dotenv.config()

const app = new Hono()

// Logger
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

// Prometheus metrics
promClient.collectDefaultMetrics()
const httpRequestDurationMs = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'code'] as const,
  buckets: [50, 100, 200, 300, 500, 1000]
})

// Redis setup - prefer explicit host/port/password from environment to avoid URL-escaping issues
const redisHost = process.env.REDIS_HOST ?? 'localhost'
const redisPort = Number(process.env.REDIS_PORT ?? 6379)
// prefer explicit REDIS_PASSWORD, otherwise try to extract from REDIS_URL if set
const redisPassword = process.env.REDIS_PASSWORD ?? process.env.REDIS_URL?.match(/redis:\/\/:?([^@]+)@/)?.[1]
let redisClient: ReturnType<typeof createClient> | null = null

function initRedis() {
  if (redisClient) return redisClient
  const client = createClient({
    socket: { host: redisHost, port: redisPort },
    password: redisPassword
  })
  client.on('error', (err) => logger.error({ err }, 'Redis error'))
  client.connect()
    .then(() => logger.info(`Connected to Redis at ${redisHost}:${redisPort}`))
    .catch((err) => logger.error({ err }, 'Failed to connect to Redis'))
  redisClient = client
  return client
}

initRedis()

// basic request timing middleware
app.use('*', async (c, next) => {
  const end = httpRequestDurationMs.startTimer()
  const route = c.req.path
  try {
    await next()
    const status = c.res.status || 200
    end({ method: c.req.method, route, code: String(status) })
  } catch (err) {
    end({ method: c.req.method, route, code: '500' })
    logger.error({ err }, 'Request handler error')
    throw err
  }
})

app.get('/', (c) => {
  logger.info('hit /')
  return c.text('Hello Hono!')
})

// Health endpoint to verify Redis connectivity
app.get('/redis', async (c) => {
  try {
    if (!redisClient) initRedis()
    const pong = await (redisClient as RedisClientType).ping()
    return c.json({ redis: pong })
  } catch (err) {
    logger.error({ err }, 'Redis ping failed')
    return c.json({ error: 'Redis not available' }, 503)
  }
})

// Prometheus metrics endpoint
app.get('/metrics', async (c) => {
  try {
    const metrics = await promClient.register.metrics()
    return c.text(metrics, 200, { 'Content-Type': promClient.register.contentType })
  } catch (err) {
    logger.error({ err }, 'Failed to collect metrics')
    return c.text('error', 500)
  }
})

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  logger.info(`Server is running on http://localhost:${info.port}`)
})
