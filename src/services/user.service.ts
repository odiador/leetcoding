import { APP_REDIRECT_URL } from '../config/env.js'
import { supabase } from '../config/supabase.js'

/**
 * Tipo de perfil de usuario
 */
export interface UserProfile {
  id: string
  full_name: string
  email: string
  role: string
  created_at?: string
  updated_at?: string
}


/**
 * Registro con email y contraseña
 */
export async function signupWithEmail(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name }
    }
  })

  if (error) {
    if (error.message.includes('already registered')) {
      throw new Error('Este correo ya está en uso')
    }
    throw new Error(`Signup failed: ${error.message}`)
  }

  if (!data.user) throw new Error('Signup failed: no user returned')

  return { user: data.user }
}


/**
 * Login con email y contraseña
 */
export async function loginWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) throw new Error(`Login failed: ${error.message}`)
  if (!data.user) throw new Error('Login failed: no user returned')

  return {
    user: data.user,
    session: data.session
  }
}

/**
 * Login con Google OAuth
 * Retorna la URL de redirección para el frontend
 */
export async function loginWithGoogle(): Promise<{ url: string }> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: APP_REDIRECT_URL
    }
  })

  if (error) throw new Error(`Google login failed: ${error.message}`)
  if (!data.url) throw new Error('Google login failed: no URL returned')

  return { url: data.url }
}

/**
 * Obtener perfil desde la tabla profiles
 */
export async function getUserById(userId: string): Promise<UserProfile> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, created_at, updated_at') // 👈 email incluido
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
  updateData: Partial<{ full_name: string; phone: string; address: string; city: string; country: string }>
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
