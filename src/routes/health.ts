import { OpenAPIHono } from '@hono/zod-openapi'

const healthRoutes = new OpenAPIHono()

// Health check endpoint (mounted at /)
healthRoutes.get('/', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Basic ping endpoint
healthRoutes.get('/ping', (c) => {
  return c.text('pong')
})

export default healthRoutes
