import { supabase, supabaseAdmin } from '../config/supabase.js'

export interface ProductKey {
  id: string
  product_id: string
  license_key: string
  user_id?: string
  status?: string
  expiration_date?: string
  activation_limit?: number
  created_at?: string
  updated_at?: string
}

export interface CreateProductKeyData {
  product_id: string
  license_key: string
  user_id?: string
  status?: string
  expiration_date?: string
  activation_limit?: number
}

export async function listProductKeys(product_id?: string): Promise<ProductKey[]> {
  // DEBUG: Verificar configuración
  console.log('=== PRODUCT KEYS DEBUG ===')
  console.log('supabaseAdmin exists:', !!supabaseAdmin)
  console.log('Using client:', supabaseAdmin ? 'supabaseAdmin' : 'supabase')
  // Test conexión antes de la consulta
  try {
    console.log('Testing schema access...')
    const testQuery = (supabaseAdmin ?? supabase)
      .from('product_keys')
      .select('count(*)')
      .limit(1)
    const { data: testData, error: testError } = await testQuery
    console.log('Schema test result:', { testData, testError })
    if (testError) {
      console.log('Error details:', {
        message: testError.message,
        code: testError.code,
        details: testError.details,
        hint: testError.hint
      })
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'message' in err) {
      console.log('Test query failed:', (err as any).message)
    } else {
      console.log('Test query failed:', err)
    }
  }
  // Consulta principal
  console.log('Executing main query...')
  let query = (supabaseAdmin ?? supabase).from('product_keys').select('*')
  if (product_id) {
    console.log('Filtering by product_id:', product_id)
    query = query.eq('product_id', product_id)
  }
  const { data, error } = await query
  console.log('Main query result:', { 
    dataLength: data?.length, 
    error: error ? {
      message: error.message,
      code: error.code,
      details: error.details
    } : null
  })
  console.log('========================')
  if (error) throw new Error(`Failed to fetch product keys: ${error.message}`)
  return data || []
}
export async function createProductKey(data: CreateProductKeyData): Promise<ProductKey> {
  const { data: key, error } = await (supabaseAdmin ?? supabase)
    .from('product_keys')
    .insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single()
  if (error) throw new Error(`Failed to create product key: ${error.message}`)
  return key
}

export async function deleteProductKey(id: string): Promise<void> {
  const { error } = await (supabaseAdmin ?? supabase).from('product_keys').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete product key: ${error.message}`)
}
