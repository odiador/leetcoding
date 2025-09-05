import type { Context, Next } from 'hono'
import { CSRF_COOKIE } from '../config/env.js'


export function csrfMiddleware() {
    return async (c: Context, next: Next) => {
        if (c.req.method === 'GET' || c.req.method === 'HEAD') return next()
        const header = c.req.header('x-csrf-token')
        const cookie = c.req.header('cookie') ?? ''
        const cookieToken = cookie.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`))?.[1]
        if (!header || !cookieToken || header !== cookieToken) {
            return c.json({ success: false, error: 'CSRF token inválido' }, 403)
        }
        return next()
    }
}

// En login/signup exitoso, emite el CSRF cookie (HttpOnly=false para que el
// frontend pueda leerlo y enviarlo en X-CSRF-Token; no contiene secretos).
export function issueCsrfCookie(): string {
    const val = crypto.randomUUID()
    const isProduction = process.env.NODE_ENV === 'production'
    const opts = [
        `Path=/`,
        `Max-Age=${60 * 60 * 24}`, // 1 día
        isProduction ? 'Secure' : '',
        'SameSite=Lax'
    ].filter(Boolean).join('; ')
    return `csrf_token=${val}; ${opts}`
}
