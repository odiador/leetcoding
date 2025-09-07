import { serve } from '@hono/node-server';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { pino } from 'pino';
import { LOG_LEVEL, PORT, API_URL } from './config/env.js';
import { createClient } from 'redis';
import { initRedis } from './config/redis.js';
import { authMiddleware, optionalAuthMiddleware } from './middlewares/index.js';
import { authRoutes, cartRoutes, healthRoutes, orderRoutes, productRoutes } from './routes/index.js';


// Importar métricas centralizadas
import {
  register,
  httpRequestDurationMs,
  httpRequestsTotal,
  redisLatency,
  redisReconnections,
} from './config/metrics.js';

const app = new OpenAPIHono();

// CORS middleware: allow frontend during development (adjust origins in production)
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || ''
  const allowedOrigins = ['http://localhost:3000','https://mercador.app']

  if (origin && allowedOrigins.includes(origin)) {
  c.header('Access-Control-Allow-Origin', origin)
  c.header('Vary', 'Origin')
  // Allow cookies/credentials from the frontend when the origin is allowed
  c.header('Access-Control-Allow-Credentials', 'true')
  } else {
    // fallback: allow all (safe for local dev) — change this for production
    c.header('Access-Control-Allow-Origin', '*')
  }

  c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  // Handle preflight
  if (c.req.method === 'OPTIONS') {
    // use a cast to satisfy library typings for the status argument
    return c.text('', 204 as any)
  }

  await next()
})



// OpenAPI documentation
app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    title: 'Mercador API',
    version: '1.0.0',
    description: 'Backend API for Mercador e-commerce platform',
  },
  servers: [{ url: API_URL || `http://localhost:${PORT}` }],
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
  // In development return error details to help debugging. Do not enable in production.
  if (process.env.NODE_ENV !== 'production') {
    return c.json({ success: false, error: err?.message ?? 'Internal server error', stack: err?.stack }, 500)
  }
  return c.json({ success: false, error: 'Internal server error' }, 500);
});

// Start server
serve(
  {
    fetch: app.fetch,
    port: PORT,
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



// 🚀 Ruta temporal para probar el callback de Google
const homeCallbackRoute = createRoute({
  method: 'get',
  path: '/home',
  responses: {
    200: {
      description: 'Página temporal para manejar el callback de Google OAuth y probar el flujo.',
      content: {
        'text/html': {
          schema: z.string(),
        },
      },
    },
  },
});

app.openapi(homeCallbackRoute, async (c) => {
  const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google OAuth Callback</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 flex items-center justify-center min-h-screen font-sans">
  <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
    <h1 class="text-2xl font-bold mb-4 text-gray-800">Procesando autenticación con Google...</h1>
    <p id="message" class="text-gray-600 mb-4 animate-pulse">Redirigiendo a tu cuenta...</p>
    <div id="result" class="bg-gray-100 p-4 rounded-md text-left text-sm text-gray-700 font-mono overflow-auto max-h-64 mt-4 hidden"></div>
  </div>

  <script>
    const resultDiv = document.getElementById('result');
    const messageDiv = document.getElementById('message');

    async function processAuthCallback() {
      try {
        // 1. Obtener el token del fragmento de la URL
        const hash = window.location.hash;
        if (!hash) {
          messageDiv.textContent = 'No se encontró el token de acceso.';
          resultDiv.textContent = 'URL sin fragmento. ¿Estás seguro de que la URL de redirección en Supabase está configurada para esta ruta?';
          resultDiv.classList.remove('hidden');
          return;
        }

        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        
        if (!accessToken) {
          messageDiv.textContent = 'No se encontró el token de acceso en la URL.';
          resultDiv.textContent = 'El fragmento de la URL no contiene "access_token". Asegúrate de que el flujo de Supabase sea correcto.';
          resultDiv.classList.remove('hidden');
          return;
        }

        messageDiv.textContent = 'Token encontrado. Enviando al servidor para validación...';
        resultDiv.textContent = 'Token de acceso: ' + accessToken.substring(0, 10) + '...';
        resultDiv.classList.remove('hidden');

        // 2. Enviar el token al endpoint del backend
        const response = await fetch('/auth/oauth/callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ access_token: accessToken })
        });
        
        const data = await response.json();
        
        // 3. Mostrar el resultado de la petición
        resultDiv.textContent += '\\n\\nRespuesta del servidor: ' + JSON.stringify(data, null, 2);
        
        if (response.ok) {
          if (data.message) {
              messageDiv.textContent = data.message;
          } else {
              messageDiv.textContent = '¡Inicio de sesión exitoso! Redirigiendo...';
          }
          // Puedes añadir una redirección aquí al dashboard si lo necesitas, por ejemplo:
          // setTimeout(() => window.location.href = '/dashboard', 2000);
        } else {
          messageDiv.textContent = 'Hubo un error al procesar el token.';
        }
      } catch (error) {
        messageDiv.textContent = 'Error de conexión. Por favor, inténtalo de nuevo.';
        resultDiv.textContent = 'Error de red: ' + error.message;
        resultDiv.classList.remove('hidden');
      }
    }

    // Iniciar el proceso al cargar la página
    window.onload = processAuthCallback;
  </script>
</body>
</html>
  `;

  return c.html(htmlContent);
});