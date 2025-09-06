// services/user.service.ts
import type { Session } from '@supabase/supabase-js'
import { APP_REDIRECT_URL } from '../config/env.js'
import { redisService } from '../config/redis.js'
import { supabase } from '../config/supabase.js'

/**
 * Tipo de perfil de usuario
 */
export interface UserProfile {
  id: string
  full_name: string
  email: string
  role: string
  country?: string
  created_at?: string
  updated_at?: string
}

// --- Métodos de Registro e Inicio de Sesión ---

/**
 * Registro con email y contraseña
 */
export async function signupWithEmail(
  email: string,
  password: string,
  metadata: {
    full_name: string
    country?: string
    role?: string
  }
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: metadata.full_name,
        country: metadata.country ?? null,
        role: metadata.role ?? 'cliente',
      },
    },
  })

  if (error) {
    if (error.message.includes('already registered')) {
      throw new Error('Este correo ya está en uso')
    }
    throw new Error(`Signup failed: ${error.message}`)
  }

  if (!data.user) throw new Error('Signup failed: no user returned')

  return { data, error }
}

/**
 * Login con email y contraseña
 * Guarda la sesión en Redis con TTL
 */
export async function loginWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw new Error(`Login failed: ${error.message}`)
  if (!data.user || !data.session)
    throw new Error('Login failed: no user/session returned')

  const { access_token, refresh_token, expires_in, user } = data.session

  // Guardar sesión en Redis con TTL
  await redisService.set(`session:${access_token}`, user.id, expires_in)
  // Guardar refresh token en Redis para validación y rotación (TTL en días)
  const refreshTtlSeconds = (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10) || 7) * 24 * 60 * 60
  await redisService.set(`refresh:${refresh_token}`, user.id, refreshTtlSeconds)

  return {
    user: data.user,
    session: data.session,
  }
}

/**
 * Iniciar sesión con Magic Link (OTP por email)
 */
export async function loginWithMagicLink(email: string) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: APP_REDIRECT_URL,
    },
  })

  if (error) {
    throw new Error(`Magic link login failed: ${error.message}`)
  }

  // No se devuelve sesión, solo se confirma el envío del correo.
  return { data, error }
}

// --- Métodos de Gestión de Contraseña y Recuperación ---

/**
 * Solicitar restablecimiento de contraseña.
 */
export async function requestPasswordReset(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${APP_REDIRECT_URL}/update-password`,
  })

  if (error) {
    throw new Error(`Password reset request failed: ${error.message}`)
  }

  return { data, error }
}

/**
 * Actualizar la contraseña del usuario.
 */
export async function updatePassword(newPassword: string) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (error) {
    throw new Error(`Password update failed: ${error.message}`)
  }
  if (!data.user) {
    throw new Error('Password update failed: no user returned')
  }

  return { user: data.user, error }
}

/**
 * Refrescar sesión y actualizar Redis
 */
export async function refreshSession(refreshToken: string) {
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  })
  if (error) throw new Error(error.message)

  if (data.session) {
    const { access_token, refresh_token, expires_in, user } = data.session
    await redisService.set(`session:${access_token}`, user.id, expires_in)
    // Rotate refresh token: delete old key and store new one with TTL
    try {
      await redisService.del(`refresh:${refreshToken}`)
    } catch (e) {
      // ignore
    }
    const refreshTtlSeconds = (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10) || 7) * 24 * 60 * 60
    await redisService.set(`refresh:${refresh_token}`, user.id, refreshTtlSeconds)
  }

  return data.session
}

// --- Métodos de Gestión de Perfil ---

/**
 * Obtener perfil desde la tabla profiles
 */
export async function getUserById(userId: string): Promise<UserProfile> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, created_at, updated_at')
    .eq('id', userId)
    .single()

  if (error || !profile) throw new Error('User not found')

  return profile as UserProfile
}

/**
 * Actualizar perfil de usuario
 */
export async function updateUser(
  userId: string,
  updateData: Partial<{
    full_name: string
    phone: string
    address: string
    city: string
    country: string
  }>
): Promise<UserProfile> {
  const { data: user, error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', userId)
    .select()
    .single()

  if (error) throw new Error(`Update failed: ${error.message}`)
  if (!user) throw new Error('Update failed: user not found')

  return user as UserProfile
}

// --- Métodos de Manejo de Sesión ---

/**
 * Obtener la sesión activa del usuario, validando con Redis
 */
export async function getSession(accessToken: string) {
  // Validar contra Redis
  const exists = await redisService.exists(`session:${accessToken}`)
  if (!exists) return null

  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(`Could not get session: ${error.message}`)

  return data.session
}

/**
 * Obtener los datos del usuario autenticado actualmente.
 */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser()

  if (error) {
    throw new Error(`Could not get user: ${error.message}`)
  }

  return data.user
}

/**
 * Cerrar la sesión del usuario actual, limpiando Redis
 */
export async function signOut(accessToken?: string) {
  if (accessToken) {
    await redisService.del(`session:${accessToken}`)
  }

  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error(`Sign out failed: ${error.message}`)
  }
}

/**
 * Revoca (elimina) un refresh token almacenado en Redis (best-effort)
 */
export async function revokeRefreshToken(refreshToken: string) {
  try {
    await redisService.del(`refresh:${refreshToken}`)
  } catch (e) {
    // no hace falta fallar si Redis no está disponible
  }
}

/**
 * Escuchar cambios en el estado de autenticación (login, logout, etc).
 */
export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void
) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(callback)

  return subscription
}

/**
 * Obtener usuario a partir de un access_token (usado por el callback OAuth)
 */
export async function getUserByAccessToken(access_token: string) {
  const { data, error } = await supabase.auth.getUser(access_token)
  return { data, error }
}
