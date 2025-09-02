import * as promClient from 'prom-client';

// Crear un registry dedicado para tus métricas
export const register = new promClient.Registry();

// Recolectar métricas por defecto (CPU, memoria, GC, event loop, etc.)
promClient.collectDefaultMetrics({ register });

// Histograma: duración de requests HTTP
export const httpRequestDurationMs = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'code'] as const,
  buckets: [50, 100, 200, 300, 500, 1000],
  registers: [register],
});

// Contador: total de requests HTTP
export const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'code'] as const,
  registers: [register],
});

// Gauge: usuarios activos (puedes setearlo manualmente en tus handlers)
export const activeUsers = new promClient.Gauge({
  name: 'active_users',
  help: 'Current number of active users',
  registers: [register],
});

// Histograma: latencia de Redis
export const redisLatency = new promClient.Histogram({
  name: 'redis_ping_latency_ms',
  help: 'Latency of Redis PING in ms',
  buckets: [1, 5, 10, 50, 100, 200, 500],
  registers: [register],
});

// Contador: reconexiones de Redis
export const redisReconnections = new promClient.Counter({
  name: 'redis_reconnections_total',
  help: 'Total number of Redis reconnections',
  registers: [register],
});
