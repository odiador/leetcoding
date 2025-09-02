import type { MiddlewareHandler } from 'hono'
import * as promClient from 'prom-client'

// Create Prometheus metrics
const httpRequestDurationMs = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'code'] as const,
  buckets: [50, 100, 200, 300, 500, 1000]
})

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'code'] as const
})

// Collect default metrics
promClient.collectDefaultMetrics()

export const metricsMiddleware: MiddlewareHandler = async (c, next) => {
  const start = Date.now()
  const method = c.req.method
  const path = c.req.path

  try {
    await next()

    const duration = Date.now() - start
    const status = c.res.status || 200

    // Record metrics
    httpRequestDurationMs
      .labels(method, path, String(status))
      .observe(duration)

    httpRequestsTotal
      .labels(method, path, String(status))
      .inc()

  } catch (error) {
    const duration = Date.now() - start

    // Record error metrics
    httpRequestDurationMs
      .labels(method, path, '500')
      .observe(duration)

    httpRequestsTotal
      .labels(method, path, '500')
      .inc()

    throw error
  }
}
