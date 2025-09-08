import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from './env.js'

// DEBUG: Verificar variables de entorno
console.log('=== ENV VARIABLES DEBUG ===')
console.log('SUPABASE_URL:', SUPABASE_URL)
console.log('ANON_KEY exists:', !!SUPABASE_ANON_KEY)
console.log('ANON_KEY length:', SUPABASE_ANON_KEY?.length)
console.log('SERVICE_ROLE_KEY exists:', !!SUPABASE_SERVICE_ROLE_KEY)
console.log('SERVICE_ROLE_KEY length:', SUPABASE_SERVICE_ROLE_KEY?.length)
console.log('SERVICE_ROLE_KEY starts with eyJ:', SUPABASE_SERVICE_ROLE_KEY?.startsWith('eyJ'))
console.log('============================')

// Create Supabase client for client-side operations
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Create Supabase client for server-side operations (with service role)
export const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null

// DEBUG: Verificar clientes creados
console.log('=== CLIENTS DEBUG ===')
console.log('supabase created:', !!supabase)
console.log('supabaseAdmin created:', !!supabaseAdmin)
console.log('=====================')