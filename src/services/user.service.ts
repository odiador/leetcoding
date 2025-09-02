import { supabase } from '../config/supabase'

/**
 * Tipo de perfil de usuario
 */
export interface UserProfile {
  id: string
  full_name: string
  role: string
  created_at?: string
  updated_at?: string
}

/**
 * Garantiza que exista un perfil para un usuario de auth
 */
export async function ensureProfile(user: { id: string; user_metadata?: any }) {
  const { data: existing, error: selectError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (selectError) {
    throw new Error(`Error checking profile: ${selectError.message}`)
  }

  if (!existing) {
    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      full_name: user.user_metadata?.full_name || '',
      role: 'cliente'
    })

    if (insertError) {
      throw new Error(`Failed to create profile: ${insertError.message}`)
    }
  }
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

  if (error) throw new Error(`Signup failed: ${error.message}`)
  if (!data.user) throw new Error('Signup failed: no user returned')

  await ensureProfile(data.user)

  return {
    user: data.user,
    session: data.session
  }
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

  await ensureProfile(data.user)

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
      redirectTo: process.env.APP_REDIRECT_URL
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
    .select('id, full_name, role, created_at, updated_at')
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
