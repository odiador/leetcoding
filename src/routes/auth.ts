import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import * as userService from '../services/user.service'
import { authMiddleware } from '../middlewares'

const authRoutes = new OpenAPIHono()

// Schemas
const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2)
})

const SignupResponse = z.object({
  success: z.boolean(),
  data: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    full_name: z.string(),
    role: z.string()
  })
})

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
})

const LoginResponse = z.object({
  success: z.boolean(),
  data: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    full_name: z.string(),
    role: z.string()
  })
})

const LoginGoogleResponse = z.object({
  success: z.boolean(),
  url: z.string().url()
})

const LogoutResponse = z.object({
  success: z.boolean(),
  message: z.string()
})

const MeResponse = z.object({
  success: z.boolean(),
  data: z.object({
    id: z.string().uuid(),
    full_name: z.string(),
    role: z.string()
  })
})

// 🚀 Signup
const signupRoute = createRoute({
  method: 'post',
  path: '/signup',
  request: {
    body: {
      content: {
        'application/json': {
          schema: SignupSchema
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      description: 'User created successfully',
      content: {
        'application/json': {
          schema: SignupResponse
        }
      }
    },
    400: {
      description: 'Signup failed'
    }
  }
})

authRoutes.openapi(signupRoute, async (c) => {
  try {
    const body = c.req.valid('json')
    const { user } = await userService.signupWithEmail(body.email, body.password, body.name)

    return c.json(
      {
        success: true,
        data: {
          id: user.id,
          email: user.email!,
          full_name: user.user_metadata?.full_name ?? '',
          role: 'cliente'
        }
      },
      200
    )
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 400)
  }
})

// 🚀 Login (email/password)
const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  request: {
    body: {
      content: {
        'application/json': {
          schema: LoginSchema
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      description: 'User logged in successfully',
      content: {
        'application/json': {
          schema: LoginResponse
        }
      }
    },
    401: {
      description: 'Invalid credentials'
    }
  }
})

authRoutes.openapi(loginRoute, async (c) => {
  try {
    const body = c.req.valid('json')
    const { user } = await userService.loginWithEmail(body.email, body.password)

    return c.json(
      {
        success: true,
        data: {
          id: user.id,
          email: user.email!,
          full_name: user.user_metadata?.full_name ?? '',
          role: 'cliente'
        }
      },
      200
    )
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 401)
  }
})

// 🚀 Login con Google
const loginGoogleRoute = createRoute({
  method: 'get',
  path: '/login/google',
  responses: {
    200: {
      description: 'Google login URL',
      content: {
        'application/json': {
          schema: LoginGoogleResponse
        }
      }
    },
    401: {
      description: 'Login failed'
    }
  }
})

authRoutes.openapi(loginGoogleRoute, async (c) => {
  try {
    const { url } = await userService.loginWithGoogle()
    return c.json({ success: true, url })
  } catch (error) {
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Login failed' },
      401
    )
  }
})

// 🚀 Logout
const logoutRoute = createRoute({
  method: 'post',
  path: '/logout',
  responses: {
    200: {
      description: 'Logged out successfully',
      content: {
        'application/json': {
          schema: LogoutResponse
        }
      }
    },
    500: {
      description: 'Logout failed'
    }
  }
})

authRoutes.openapi(logoutRoute, async (c) => {
  try {
    // En Supabase logout normalmente se hace desde el cliente
    return c.json({ success: true, message: 'Logged out successfully' })
  } catch (error) {
    return c.json({ success: false, error: 'Logout failed' }, 500)
  }
})

// 🚀 Me (perfil actual)
const meRoute = createRoute({
  method: 'get',
  path: '/me',
  responses: {
    200: {
      description: 'Current user info',
      content: {
        'application/json': {
          schema: MeResponse
        }
      }
    },
    401: {
      description: 'Not authenticated'
    },
    500: {
      description: 'Failed to get user'
    }
  }
})

authRoutes.openapi(meRoute, async (c) => {
  try {
    const userId = c.get('userId')
    if (!userId) {
      return c.json({ success: false, error: 'Not authenticated' }, 401)
    }

    const user = await userService.getUserById(userId)

    return c.json({ success: true, data: user })
  } catch (error) {
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get user' },
      500
    )
  }
})

export default authRoutes
