import { serve } from '@hono/node-server';
import { OpenAPIHono } from '@hono/zod-openapi';
import { pino } from 'pino';
import { LOG_LEVEL } from './config/env';
import { createClient } from 'redis';
import { initRedis } from './config/redis';
import { authMiddleware, optionalAuthMiddleware } from './middlewares';
import { authRoutes, cartRoutes, healthRoutes, orderRoutes, productRoutes } from './routes';

// Importar métricas centralizadas
import {
  register,
  httpRequestDurationMs,
  httpRequestsTotal,
  redisLatency,
  redisReconnections,
} from './config/metrics';

const app = new OpenAPIHono();

// OpenAPI documentation
app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    title: 'Mercador API',
    version: '1.0.0',
    description: 'Backend API for Mercador e-commerce platform',
  },
  servers: [{ url: 'http://localhost:3010' }],
});

app.get('/openapi', (c) => {
  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mercador API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@4/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@4/swagger-ui-bundle.js"></script>
    <script>
      window.onload = function() {
        SwaggerUIBundle({
          url: '/doc',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis]
        });
      };
    </script>
  </body>
</html>`;
  return c.html(html);
});

// Logger
const logger = pino({ level: LOG_LEVEL });

// Redis client
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient(logger: any): Promise<ReturnType<typeof createClient>> {
  if (!redisClient) {
    redisClient = await initRedis(logger);

    // Contar reconexiones
    redisClient.on('reconnecting', () => {
      redisReconnections.inc();
      logger.warn('Redis is reconnecting...');
    });
  }
  return redisClient;
}

// Middleware para medir requests
app.use('*', async (c, next) => {
  const end = httpRequestDurationMs.startTimer();
  const route = c.req.path;
  try {
    await next();
    const status = c.res.status || 200;

    end({ method: c.req.method, route, code: String(status) });
    httpRequestsTotal.inc({ method: c.req.method, route, code: String(status) });
  } catch (err) {
    end({ method: c.req.method, route, code: '500' });
    httpRequestsTotal.inc({ method: c.req.method, route, code: '500' });
    logger.error({ err }, 'Request handler error');
    throw err;
  }
});

// Root
app.get('/', (c) => {
  logger.info('hit /');
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Mercador</title>
    <style>
      body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#f7fafc }
      .card { background:#fff; padding:24px; border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,0.06); text-align:center }
      button { background:#2563eb; color:#fff; border:none; padding:12px 20px; border-radius:6px; font-size:16px; cursor:pointer }
      button:hover { background:#1e40af }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Mercador</h1>
      <p>Bienvenido — inicia sesión para continuar</p>
      <a href="/auth/login/google"><button type="button">Iniciar sesión</button></a>
    </div>
  </body>
</html>`;

  return c.html(html);
});

// Apply middleware
app.use('/cart/*', authMiddleware);
app.use('/orders/*', authMiddleware);
app.use('/auth/me', authMiddleware);
app.use('/products/*', optionalAuthMiddleware);

// Mount routes
app.route('/health', healthRoutes);
app.route('/auth', authRoutes);
app.route('/products', productRoutes);
app.route('/cart', cartRoutes);
app.route('/orders', orderRoutes);

// Health endpoint para Redis
app.get('/redis', async (c) => {
  try {
    const client = await getRedisClient(logger);

    const start = Date.now();
    const pong = await client.ping();
    const duration = Date.now() - start;

    redisLatency.observe(duration);

    return c.json({ redis: pong, latency_ms: duration });
  } catch (err) {
    logger.error({ err }, 'Redis ping failed');
    return c.json({ error: 'Redis not available' }, 503);
  }
});

// Prometheus metrics endpoint
app.get('/metrics', async (c) => {
  try {
    const metrics = await register.metrics();
    return c.text(metrics, 200, { 'Content-Type': register.contentType });
  } catch (err) {
    logger.error({ err }, 'Failed to collect metrics');
    return c.text('error', 500);
  }
});

// Error handler
app.onError((err, c) => {
  logger.error({ err }, 'Unhandled error');
  return c.json({ success: false, error: 'Internal server error' }, 500);
});

// Start server
serve(
  {
    fetch: app.fetch,
    port: 3010,
  },
  (info) => {
    logger.info(`Server is running on http://localhost:${info.port}`);
  },
);

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (redisClient) {
      await redisClient.quit();
      logger.info('Redis connection closed');
    }
    process.exit(0);
  });
}
