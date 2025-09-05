import { APP_REDIRECT_URL } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import type { Session } from '@supabase/supabase-js';

/**
 * Tipo de perfil de usuario
 */
export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  created_at?: string;
  updated_at?: string;
}

// --- Métodos de Registro e Inicio de Sesión ---

/**
 * Registro con email y contraseña
 */
export async function signupWithEmail(
  email: string,
  password: string,
  metadata: { full_name: string; phone?: string; address?: string; city?: string; country?: string; role?: string }
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: metadata.full_name,
        phone: metadata.phone ?? null,
        address: metadata.address ?? null,
        city: metadata.city ?? null,
        country: metadata.country ?? null,
        role: metadata.role ?? 'cliente',
      },
    },
  });

  if (error) {
    if (error.message.includes('already registered')) {
      throw new Error('Este correo ya está en uso');
    }
    throw new Error(`Signup failed: ${error.message}`);
  }

  if (!data.user) throw new Error('Signup failed: no user returned');
  return { data, error };
}

/**
 * Login con email y contraseña
 */
export async function loginWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw new Error(`Login failed: ${error.message}`);
  if (!data.user) throw new Error('Login failed: no user returned');

  return {
    user: data.user,
    session: data.session,
  };
}

/**
 * Login con Google OAuth
 * Retorna la URL de redirección para el frontend
 */
export async function loginWithGoogle(): Promise<{ url: string }> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: APP_REDIRECT_URL,
    },
  });

  if (error) throw new Error(`Google login failed: ${error.message}`);
  if (!data.url) throw new Error('Google login failed: no URL returned');

  return { url: data.url };
}

/**
 * Iniciar sesión con Magic Link (OTP por email)
 * Envía un enlace de inicio de sesión al correo del usuario.
 */
export async function loginWithMagicLink(email: string) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: APP_REDIRECT_URL,
    },
  });

  if (error) {
    throw new Error(`Magic link login failed: ${error.message}`);
  }

  // No se devuelve sesión, solo se confirma el envío del correo.
  return { data, error };
}

// --- Métodos de Gestión de Contraseña y Recuperación ---

/**
 * Solicitar restablecimiento de contraseña.
 * Envía un correo al usuario con un enlace para actualizar su contraseña.
 */
export async function requestPasswordReset(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${APP_REDIRECT_URL}/update-password`, // URL del frontend para cambiar la clave
  });

  if (error) {
    throw new Error(`Password reset request failed: ${error.message}`);
  }

  return { data, error };
}

/**
 * Actualizar la contraseña del usuario.
 * Debe llamarse cuando el usuario está en la página de "update-password"
 * tras hacer clic en el enlace de recuperación.
 */
export async function updatePassword(newPassword: string) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw new Error(`Password update failed: ${error.message}`);
  }
  if (!data.user) {
    throw new Error('Password update failed: no user returned');
  }

  return { user: data.user, error };
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
    .single();

  if (error || !profile) throw new Error('User not found');

  return profile as UserProfile;
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
    .single();

  if (error) throw new Error(`Update failed: ${error.message}`);
  if (!user) throw new Error('Update failed: user not found');

  return user as UserProfile;
}

// --- Métodos de Manejo de Sesión ---

/**
 * Obtener la sesión activa del usuario.
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(`Could not get session: ${error.message}`);
  }

  return data.session;
}

/**
 * Obtener los datos del usuario autenticado actualmente.
 */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Could not get user: ${error.message}`);
  }

  return data.user;
}

/**
 * Cerrar la sesión del usuario actual.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(`Sign out failed: ${error.message}`);
  }
}

/**
 * Escuchar cambios en el estado de autenticación (login, logout, etc).
 * @param callback - Función que se ejecuta cuando el estado de auth cambia.
 * @returns La suscripción, que tiene un método .unsubscribe() para limpiar el listener.
 */
export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void
) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(callback);

  return subscription;
}


/**
 * Obtener usuario a partir de un access_token (usado por el callback OAuth)
 */
export async function getUserByAccessToken(access_token: string) {
  const { data, error } = await supabase.auth.getUser(access_token)
  return { data, error }
}
