import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import jwt from 'jsonwebtoken'
import { POST_LOGOUT_REDIRECT_URL } from '../config/env'
import { supabase } from '../config/supabase'
import * as userService from '../services/user.service'
import type { User } from '@supabase/supabase-js'

const authRoutes = new OpenAPIHono()

// Schemas
const SignupSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
  name: z.string().min(2)
})

const SignupResponse = z.object({
  success: z.boolean(),
  data: z.object({
    id: z.string().uuid(),
    email: z.email(),
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
    id: z.uuid(),
    full_name: z.string(),
    role: z.string(),
    email: z.email()
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
    // If called from a browser, redirect directly to the OAuth URL for manual testing
    const accept = c.req.header('accept') || ''
    if (accept.includes('text/html')) {
      return c.redirect(url)
    }

    return c.json({ success: true, url })
  } catch (error) {
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Login failed' },
      401
    )
  }
})

// OAuth callback used by client-side redirect page: receives access_token from the browser
const oauthCallbackSchema = z.object({ access_token: z.string().min(1) })

const oauthCallbackRoute = createRoute({
  method: 'post',
  path: '/oauth/callback',
  request: {
    body: {
      content: {
        'application/json': {
          schema: oauthCallbackSchema
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      description: 'OAuth callback accepted',
      content: {
        'application/json': {
          schema: MeResponse
        }
      }
    },
    400: { description: 'Missing token' },
    401: { description: 'Invalid token' },
    500: { description: 'Callback failed' }
  }
})

authRoutes.openapi(oauthCallbackRoute, async (c) => {
  try {
    // 1. Obtener el access_token
    const host = c.req.header('host') || 'localhost'
    const url = new URL(c.req.url, `http://${host}`)
    let access_token = url.searchParams.get('access_token') || null

    if (!access_token) {
      try {
        const ct = c.req.header('content-type') || ''
        if (ct.includes('application/json')) {
          const body = await c.req.json()
          access_token = body?.access_token
        }
      } catch (err) {
        // ignore
      }
    }

    if (!access_token) return c.json({ success: false, error: 'no token' }, 400)

    // 2. Obtener usuario desde Supabase
    const { data, error } = await supabase.auth.getUser(access_token)
    if (error || !data.user) return c.json({ success: false, error: 'invalid token' }, 401)

    const user = data.user
    const email = user.email ?? user.user_metadata?.email ?? null

    if (!email) {
      return c.json({ success: false, error: 'No se pudo obtener el email del usuario' }, 400)
    }

    // 3. Calcular TTL
    let ttl = 3600
    try {
      const decoded = jwt.decode(access_token) as { exp?: number } | null
      if (decoded?.exp) {
        const now = Math.floor(Date.now() / 1000)
        ttl = Math.max(60, Math.min(decoded.exp - now - 30, 6 * 60 * 60))
      }
    } catch (err) { }

    const setCookie = `sb_access_token=${access_token}; HttpOnly; Path=/; Max-Age=${ttl}`

    // 4. Devolver user + cookie
    return c.json(
      {
        success: true,
        data: {
          id: user.id,
          email,
          full_name: user.user_metadata?.full_name ?? '',
          role: 'cliente'
        }
      },
      { status: 200, headers: { 'Set-Cookie': setCookie } }
    )
  } catch (err) {
    return c.json(
      { success: false, error: err instanceof Error ? err.message : 'callback failed' },
      500
    )
  }
})

// Serve a small HTML page to extract the fragment (#access_token=...) and POST it to the server
authRoutes.get('/auth/callback', (c) => {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Auth callback</title>
  </head>
  <body>
    <p>Processing login...</p>
    <script>
      (async function(){
        try {
          const hash = window.location.hash.substring(1);
          const params = new URLSearchParams(hash);
          const access_token = params.get('access_token');
          if (!access_token) {
            document.body.textContent = 'No access token found in URL fragment.';
            return;
          }
          const res = await fetch('/auth/oauth/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token })
          });
          if (res.ok) {
            window.location.href = '${POST_LOGOUT_REDIRECT_URL}';
          } else {
            const body = await res.text();
            document.body.textContent = 'Auth callback failed: ' + body;
          }
        } catch (err) {
          document.body.textContent = 'Error: ' + (err && err.message ? err.message : err);
        }
      })();
    </script>
  </body>
</html>`
  return c.html(html)
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
