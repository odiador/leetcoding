/**
 * Servicio de administración y estadísticas
 *
 * Este módulo proporciona funcionalidades administrativas para el panel
 * de administración, incluyendo estadísticas consolidadas, métricas de ventas,
 * análisis de inventario y gestión de órdenes.
 *
 * Funcionalidades implementadas:
 * - ✅ Dashboard con estadísticas consolidadas
 * - ✅ Métricas de ventas y revenue
 * - ✅ Análisis de productos y stock
 * - ✅ Estadísticas de usuarios
 * - ✅ Identificación de productos más vendidos
 * - ✅ Alertas de bajo stock
 *
 * @module services/admin.service
 *
 * @example
 * ```typescript
 * import { getDashboardStats } from './services/admin.service'
 *
 * // Obtener estadísticas del dashboard
 * const stats = await getDashboardStats()
 * ```
 */

import { supabase, supabaseAdmin } from '../config/supabase.js'
import { createSupabaseClient } from './user.service.js'

export interface DashboardStats {
  totalSales: number
  totalRevenue: number
  totalProducts: number
  totalUsers: number
  lowStockProducts: number
  recentOrders: number
  topSellingProduct: string
  averageOrderValue: number
}

export interface OrderWithItems {
  id: number
  user_id: string
  status: string
  total_amount: number
  shipping_address: any
  payment_method: string
  created_at: string
  updated_at: string
  order_items?: Array<{
    id: number
    order_id: number
    product_id: number
    quantity: number
    price: number
    product?: {
      id: number
      name: string
      image_url?: string
    }
  }>
}

/**
 * Obtiene estadísticas consolidadas para el dashboard del administrador
 * @param adminId ID del usuario administrador
 * @param accessToken Token de acceso opcional
 * @returns Estadísticas del dashboard
 */
export async function getDashboardStats(adminId: string, accessToken?: string): Promise<DashboardStats> {
  // Verificar permisos de administrador
  const userClient = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin || supabase)
  
  const { data: adminProfile, error: adminError } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (adminError || !adminProfile || adminProfile.role !== 'admin') {
    throw new Error('No autorizado')
  }

  // Usar cliente admin para operaciones de estadísticas
  const client = supabaseAdmin || supabase

  // 1. Total de ventas (órdenes completadas)
  const { count: totalSales, error: salesError } = await client
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .in('status', ['confirmed', 'shipped', 'delivered'])

  if (salesError) {
    throw new Error(`Failed to fetch total sales: ${salesError.message}`)
  }

  // 2. Total de ingresos (suma de total_amount de órdenes completadas)
  const { data: revenueData, error: revenueError } = await client
    .from('orders')
    .select('total_amount')
    .in('status', ['confirmed', 'shipped', 'delivered'])

  if (revenueError) {
    throw new Error(`Failed to fetch total revenue: ${revenueError.message}`)
  }

  const totalRevenue = revenueData?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0

  // 3. Total de productos (solo productos activos)
  const { count: totalProducts, error: productsError } = await client
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  if (productsError) {
    throw new Error(`Failed to fetch total products: ${productsError.message}`)
  }

  // 4. Total de usuarios
  const { count: totalUsers, error: usersError } = await client
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_deleted', false)

  if (usersError) {
    throw new Error(`Failed to fetch total users: ${usersError.message}`)
  }

  // 5. Productos con bajo stock (menos de 10 unidades y estado activo)
  const { count: lowStockProducts, error: lowStockError } = await client
    .from('products')
    .select('*', { count: 'exact', head: true })
    .lt('stock_quantity', 10)
    .eq('status', 'active')

  if (lowStockError) {
    throw new Error(`Failed to fetch low stock products: ${lowStockError.message}`)
  }

  // 6. Órdenes recientes (últimos 30 días)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { count: recentOrders, error: recentOrdersError } = await client
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', thirtyDaysAgo.toISOString())

  if (recentOrdersError) {
    throw new Error(`Failed to fetch recent orders: ${recentOrdersError.message}`)
  }

  // 7. Producto más vendido
  const { data: orderItems, error: orderItemsError } = await client
    .from('order_items')
    .select(`
      product_id,
      quantity,
      product:products!inner(
        id,
        name,
        status
      )
    `)

  if (orderItemsError) {
    throw new Error(`Failed to fetch order items: ${orderItemsError.message}`)
  }

  // Agrupar por producto y sumar cantidades (solo productos activos)
  const productSales = new Map<number, { name: string; totalQuantity: number }>()
  
  orderItems?.forEach((item: any) => {
    // Solo contar productos activos
    if (!item.product || item.product.status !== 'active') return
    
    const productId = item.product_id
    const productName = item.product.name || 'Unknown Product'
    const quantity = item.quantity || 0

    if (productSales.has(productId)) {
      const existing = productSales.get(productId)!
      existing.totalQuantity += quantity
    } else {
      productSales.set(productId, { name: productName, totalQuantity: quantity })
    }
  })

  // Encontrar el producto más vendido
  let topSellingProduct = 'N/A'
  let maxQuantity = 0

  productSales.forEach((value) => {
    if (value.totalQuantity > maxQuantity) {
      maxQuantity = value.totalQuantity
      topSellingProduct = value.name
    }
  })

  // 8. Valor promedio de orden
  const averageOrderValue = totalSales && totalSales > 0 ? Math.round(totalRevenue / totalSales) : 0

  return {
    totalSales: totalSales || 0,
    totalRevenue: Math.round(totalRevenue),
    totalProducts: totalProducts || 0,
    totalUsers: totalUsers || 0,
    lowStockProducts: lowStockProducts || 0,
    recentOrders: recentOrders || 0,
    topSellingProduct,
    averageOrderValue
  }
}

/**
 * Obtiene todas las órdenes del sistema con paginación y filtros
 * @param adminId ID del usuario administrador
 * @param filters Filtros opcionales (status, page, limit)
 * @param accessToken Token de acceso opcional
 * @returns Lista de órdenes con paginación
 */
export async function getAllOrdersAdmin(
  adminId: string,
  filters: { status?: string; page?: number; limit?: number } = {},
  accessToken?: string
): Promise<{ orders: OrderWithItems[]; total: number; pagination: any }> {
  // Verificar permisos de administrador
  const userClient = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin || supabase)
  
  const { data: adminProfile, error: adminError } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (adminError || !adminProfile || adminProfile.role !== 'admin') {
    throw new Error('No autorizado')
  }

  const { status, page = 1, limit = 10 } = filters

  // Usar cliente admin para operaciones administrativas
  const client = supabaseAdmin || supabase

  let query = client
    .from('orders')
    .select(`
      *,
      order_items (
        *,
        product:products (
          id,
          name,
          image_url,
          price,
          status
        )
      )
    `, { count: 'exact' })

  if (status) {
    query = query.eq('status', status)
  }

  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to).order('created_at', { ascending: false })

  const { data: orders, error, count } = await query

  if (error) {
    console.error('Error fetching admin orders:', error)
    throw new Error(`Failed to fetch orders: ${error.message}`)
  }

  return {
    orders: orders || [],
    total: count || 0,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    }
  }
}

/**
 * Obtiene estadísticas detalladas de todos los productos
 * @param adminId ID del usuario administrador
 * @param accessToken Token de acceso opcional
 * @returns Estadísticas de productos con ventas
 */
export async function getProductsWithStats(
  adminId: string,
  accessToken?: string
): Promise<Array<{
  id: number
  name: string
  price: number
  stock_quantity: number
  status: string
  total_sold: number
  revenue: number
}>> {
  // Verificar permisos de administrador
  const userClient = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin || supabase)
  
  const { data: adminProfile, error: adminError } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (adminError || !adminProfile || adminProfile.role !== 'admin') {
    throw new Error('No autorizado')
  }

  const client = supabaseAdmin || supabase

  // Obtener todos los productos
  const { data: products, error: productsError } = await client
    .from('products')
    .select('id, name, price, stock_quantity, status')
    .eq('status', 'active')
    .order('name')

  if (productsError) {
    throw new Error(`Failed to fetch products: ${productsError.message}`)
  }

  // Obtener estadísticas de ventas por producto
  const { data: orderItems, error: orderItemsError } = await client
    .from('order_items')
    .select('product_id, quantity, price')

  if (orderItemsError) {
    throw new Error(`Failed to fetch order items: ${orderItemsError.message}`)
  }

  // Crear mapa de estadísticas de ventas
  const salesStats = new Map<number, { total_sold: number; revenue: number }>()
  
  orderItems?.forEach((item: any) => {
    const productId = item.product_id
    const quantity = item.quantity || 0
    const itemRevenue = (item.price || 0) * quantity

    if (salesStats.has(productId)) {
      const existing = salesStats.get(productId)!
      existing.total_sold += quantity
      existing.revenue += itemRevenue
    } else {
      salesStats.set(productId, { total_sold: quantity, revenue: itemRevenue })
    }
  })

  // Combinar productos con estadísticas
  return (products || []).map((product: any) => {
    const stats = salesStats.get(product.id) || { total_sold: 0, revenue: 0 }
    return {
      id: product.id,
      name: product.name,
      price: product.price,
      stock_quantity: product.stock_quantity,
      status: product.status,
      total_sold: stats.total_sold,
      revenue: Math.round(stats.revenue)
    }
  })
}
