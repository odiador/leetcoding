
import { supabase } from '../config/supabase.js'
import { createProductKey, CreateProductKeyData } from './product_key.service.js'

export interface Product {
  id: string
  name: string
  description: string
  price: number
  category: string
  image_url?: string
  stock_quantity: number
  created_at: string
  updated_at: string
}

export interface CreateProductData {
  name: string
  description: string
  price: number
  category: string
  image_url?: string
  stock_quantity: number
  product_keys?: Omit<CreateProductKeyData, 'product_id'>[] // Opcional: claves a crear junto con el producto
}

export interface ProductFilters {
  page?: number
  limit?: number
  category?: string
  search?: string
}

export async function listProducts(filters: ProductFilters = {}) {
  const { page = 1, limit = 10, category, search } = filters

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })

  // Apply filters
  if (category) {
    query = query.eq('category', category)
  }

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  // Apply pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to)

  const { data: products, error, count } = await query

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`)
  }

  return {
    products: products || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    }
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null // Product not found
    }
    throw new Error(`Failed to fetch product: ${error.message}`)
  }

  return product
}


export async function createProduct(productData: CreateProductData): Promise<Product> {
  // Extraer product_keys si vienen
  const { product_keys, ...productFields } = productData as any;
  const { data: product, error } = await supabase
    .from('products')
    .insert({
      ...productFields,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create product: ${error.message}`)
  }

  // Si hay product_keys, crearlas asociadas al producto
  if (Array.isArray(product_keys) && product_keys.length > 0) {
    for (const keyData of product_keys) {
      await createProductKey({ ...keyData, product_id: product.id });
    }
  }

  return product;
}

export async function updateProduct(id: string, updateData: Partial<CreateProductData>): Promise<Product> {
  const { data: product, error } = await supabase
    .from('products')
    .update({
      ...updateData,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update product: ${error.message}`)
  }

  return product
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to delete product: ${error.message}`)
  }
}

export async function getProductsByCategory(category: string): Promise<Product[]> {
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('category', category)

  if (error) {
    throw new Error(`Failed to fetch products by category: ${error.message}`)
  }

  return products || []
}
