# Mercador Backend

Un backend moderno y escalable construido con **Hono**, **Supabase** y **Redis**, siguiendo una arquitectura limpia y modular.

## 🏗️ Arquitectura

```
src/
├── config/                # Configuración de infraestructura
│   ├── redis.ts           # Cliente Redis centralizado
│   ├── supabase.ts        # Cliente Supabase (auth, queries)
│   └── env.ts             # Validación de variables de entorno
│
├── routes/                # Definición de endpoints (routers de Hono)
│   ├── index.ts           # Enrutador raíz (agrega sub-rutas)
│   ├── health.ts          # /health y /metrics
│   ├── auth.ts            # /auth (login, signup, logout)
│   ├── products.ts        # /products CRUD
│   ├── cart.ts            # /cart endpoints
│   └── orders.ts          # /orders endpoints
│
├── services/              # Lógica de negocio (usa config + db)
│   ├── user.service.ts    # Manejo de usuarios/profiles
│   ├── product.service.ts # Operaciones sobre productos
│   ├── cart.service.ts    # Manejo de carrito
│   └── order.service.ts   # Manejo de órdenes
│
├── utils/                 # Helpers reutilizables
│   ├── logger.ts          # Config de Pino logger
│   └── errors.ts          # Custom errors y manejadores
│
├── middlewares/           # Middlewares de Hono
│   ├── metrics.ts         # Prometheus + request timing
│   ├── auth.ts            # Verificación de JWT / roles
│   └── errorHandler.ts    # Manejo de errores global
│
├── index.ts               # Punto de entrada principal (server)
└── types/                 # Tipos y definiciones compartidas
    └── global.d.ts
```

## 🚀 Flujo de la Aplicación

### 1. index.ts - Punto de entrada

```typescript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { errorHandler, metricsMiddleware } from './middlewares'
import { healthRoutes, authRoutes, productRoutes, cartRoutes, orderRoutes } from './routes'

const app = new Hono()

// Middlewares globales
app.use('*', errorHandler)
app.use('*', metricsMiddleware)

// Rutas
app.route('/health', healthRoutes)
app.route('/auth', authRoutes)
app.route('/products', productRoutes)
app.route('/cart', cartRoutes)
app.route('/orders', orderRoutes)

// Servidor
serve({
  fetch: app.fetch,
  port: 3010
}, (info) => {
  console.log(`Server running on http://localhost:${info.port}`)
})
```

### 2. Routes - Definición de Endpoints

**Solo definen endpoints → llaman a services**

```typescript
// routes/products.ts
import { Hono } from 'hono'
import * as productService from '../services/product.service'

const products = new Hono()

products.get('/', async (c) => {
  const { page = 1, limit = 10, category, search } = c.req.query()
  const result = await productService.listProducts({
    page: Number(page),
    limit: Number(limit),
    category,
    search
  })
  return c.json({ success: true, data: result })
})

products.post('/', async (c) => {
  const productData = await c.req.json()
  const product = await productService.createProduct(productData)
  return c.json({ success: true, data: product }, 201)
})

export default products
```

### 3. Services - Lógica de Negocio

**Contienen la lógica real, usan config + database**

```typescript
// services/product.service.ts
import { supabase } from '../config/supabase'

export async function listProducts(filters = {}) {
  const { page = 1, limit = 10, category, search } = filters

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })

  if (category) query = query.eq('category', category)
  if (search) query = query.ilike('name', `%${search}%`)

  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to)

  const { data: products, error, count } = await query

  if (error) throw new Error(`Failed to fetch products: ${error.message}`)

  return {
    products: products || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    }
  }
}

export async function createProduct(productData) {
  const { data: product, error } = await supabase
    .from('products')
    .insert({
      ...productData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create product: ${error.message}`)
  return product
}
```

### 4. Config - Infraestructura

**Conexiones externas, inicializadas una sola vez**

```typescript
// config/supabase.ts
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
})

const env = envSchema.parse(process.env)

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
```

### 5. Middlewares - Código Transversal

```typescript
// middlewares/auth.ts
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../config/env'

export const authMiddleware = async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return c.json({ success: false, error: 'No token provided' }, 401)
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    c.set('userId', decoded.userId)
    c.set('userEmail', decoded.email)
    await next()
  } catch (error) {
    return c.json({ success: false, error: 'Invalid token' }, 401)
  }
}
```

## 📋 API Endpoints

### Health & Monitoring
- `GET /health` - Health check básico
- `GET /health/ping` - Ping simple
- `GET /health/metrics` - Métricas de Prometheus

### Authentication
- `POST /auth/login` - Login de usuario
- `POST /auth/signup` - Registro de usuario
- `POST /auth/logout` - Logout
- `GET /auth/me` - Información del usuario actual

### Products
- `GET /products` - Listar productos (con filtros y paginación)
- `GET /products/:id` - Obtener producto específico
- `POST /products` - Crear producto (admin)
- `PUT /products/:id` - Actualizar producto (admin)
- `DELETE /products/:id` - Eliminar producto (admin)

### Cart
- `GET /cart` - Obtener carrito del usuario
- `POST /cart/items` - Agregar item al carrito
- `PUT /cart/items/:itemId` - Actualizar cantidad
- `DELETE /cart/items/:itemId` - Remover item
- `DELETE /cart` - Vaciar carrito

### Orders
- `GET /orders` - Obtener órdenes del usuario
- `GET /orders/:id` - Obtener orden específica
- `POST /orders` - Crear orden desde carrito
- `PUT /orders/:id/status` - Actualizar estado (admin)

## 🛠️ Tecnologías

- **Runtime**: Node.js con ES modules
- **Framework**: Hono (alternativa moderna a Express)
- **Database**: Supabase (PostgreSQL + Auth)
- **Cache**: Redis
- **Auth**: JWT + Supabase Auth
- **Validation**: Zod
- **Logging**: Pino
- **Metrics**: Prometheus
- **Password Hashing**: bcrypt
- **Types**: TypeScript

## 🚀 Instalación y Configuración

### 1. Clona el repositorio
```bash
git clone <repository-url>
cd mercador-backend
```

### 2. Instala dependencias
```bash
npm install
```

### 3. Variables de entorno
Crea un archivo `.env`:
```env
# Server
NODE_ENV=development
PORT=3010

# Supabase
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Redis
REDIS_URL=redis://localhost:6379
# O usa variables separadas:
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Auth
JWT_SECRET=your-super-secret-jwt-key

# Logging
LOG_LEVEL=info
```

### 4. Configura la base de datos
Ejecuta las migraciones de Supabase para crear las tablas necesarias.

### 5. Ejecuta el servidor
```bash
npm run dev
```

El servidor estará disponible en `http://localhost:3010`

## 🧪 Testing

```bash
# Ejecutar tests
npm test

# Ejecutar tests con coverage
npm run test:coverage

# Ejecutar tests en modo watch
npm run test:watch
```

## 📊 Monitoreo

### Métricas disponibles
- `http_request_duration_ms` - Duración de requests HTTP
- `http_requests_total` - Total de requests HTTP
- Métricas por defecto de Node.js (memoria, CPU, etc.)

### Health checks
- `GET /health` - Verifica conectividad básica
- `GET /health/ping` - Verifica que el servidor responde
- `GET /health/metrics` - Métricas de Prometheus

## 🔒 Seguridad

- **Autenticación**: JWT tokens con expiración
- **Autorización**: Middleware de roles y permisos
- **Validación**: Zod schemas para input validation
- **Rate limiting**: Configurable por endpoint
- **CORS**: Configurado para orígenes específicos
- **Helmet**: Headers de seguridad HTTP

## 📈 Escalabilidad

### Estrategias implementadas
- **Separación de responsabilidades**: Routes → Services → Config
- **Conexiones reutilizables**: Singleton para Redis y Supabase
- **Paginación**: En endpoints que retornan listas
- **Índices de BD**: Optimización de queries
- **Cache**: Redis para datos frecuentemente accedidos

### Escalabilidad horizontal
- **Stateless**: El servidor no mantiene estado
- **Configuración externa**: Variables de entorno
- **Logging centralizado**: Fácil de integrar con ELK stack
- **Métricas**: Monitoreo con Prometheus/Grafana

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## 📞 Soporte

Para soporte, email a support@mercador.com o crea un issue en GitHub.

---

**Desarrollado con ❤️ usando tecnologías modernas y mejores prácticas**
