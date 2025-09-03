import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import * as productService from '../services/product.service.js'

const productRoutes = new OpenAPIHono()

// Schemas
const Product = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  price: z.number().positive(),
  category: z.string(),
  image_url: z.string().url().optional(),
  stock_quantity: z.number().int().min(0),
  created_at: z.string(),
  updated_at: z.string()
})

const CreateProductData = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().positive(),
  category: z.string().min(1),
  image_url: z.string().url().optional(),
  stock_quantity: z.number().int().min(0)
})

const UpdateProductData = CreateProductData.partial()

const Pagination = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0)
})

const ListProductsResponse = z.object({
  success: z.boolean(),
  data: z.object({
    products: z.array(Product),
    pagination: Pagination
  })
})

const SingleProductResponse = z.object({
  success: z.boolean(),
  data: Product
})

const CreateProductResponse = z.object({
  success: z.boolean(),
  data: Product
})

const UpdateProductResponse = z.object({
  success: z.boolean(),
  data: Product
})

const DeleteProductResponse = z.object({
  success: z.boolean(),
  message: z.string()
})

// Routes
const listProductsRoute = createRoute({
  method: 'get',
  path: '/',
  request: {
    query: z.object({
      page: z.string().optional().transform(val => val ? Number(val) : 1),
      limit: z.string().optional().transform(val => val ? Number(val) : 10),
      category: z.string().optional(),
      search: z.string().optional()
    })
  },
  responses: {
    200: {
      description: 'List of products',
      content: {
        'application/json': {
          schema: ListProductsResponse
        }
      }
    },
    500: {
      description: 'Failed to fetch products'
    }
  }
})

productRoutes.openapi(listProductsRoute, async (c) => {
  try {
  const { page, limit, category, search } = c.req.valid('query')

    const result = await productService.listProducts({
      page,
      limit,
      category,
      search
    })

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch products'
    }, 500)
  }
})

const getProductRoute = createRoute({
  method: 'get',
  path: '/:id',
  request: {
    params: z.object({
      id: z.string().uuid()
    })
  },
  responses: {
    200: {
      description: 'Single product',
      content: {
        'application/json': {
          schema: SingleProductResponse
        }
      }
    },
    404: {
      description: 'Product not found'
    },
    500: {
      description: 'Failed to fetch product'
    }
  }
})

productRoutes.openapi(getProductRoute, async (c) => {
  try {
  const { id } = c.req.valid('param')

    const product = await productService.getProductById(id)

    if (!product) {
      return c.json({
        success: false,
        error: 'Product not found'
      }, 404)
    }

    return c.json({
      success: true,
      data: product
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch product'
    }, 500)
  }
})

const createProductRoute = createRoute({
  method: 'post',
  path: '/',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateProductData
        }
      },
      required: true
    }
  },
  responses: {
    201: {
      description: 'Product created',
      content: {
        'application/json': {
          schema: CreateProductResponse
        }
      }
    },
    400: {
      description: 'Failed to create product'
    }
  }
})

productRoutes.openapi(createProductRoute, async (c) => {
  try {
  const productData = c.req.valid('json')

    const product = await productService.createProduct(productData)

    return c.json({
      success: true,
      data: product
    }, 201)
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create product'
    }, 400)
  }
})

const updateProductRoute = createRoute({
  method: 'put',
  path: '/:id',
  request: {
    params: z.object({
      id: z.string().uuid()
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateProductData
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      description: 'Product updated',
      content: {
        'application/json': {
          schema: UpdateProductResponse
        }
      }
    },
    400: {
      description: 'Failed to update product'
    }
  }
})

productRoutes.openapi(updateProductRoute, async (c) => {
  try {
  const { id } = c.req.valid('param')
  const updateData = c.req.valid('json')

    const product = await productService.updateProduct(id, updateData)

    return c.json({
      success: true,
      data: product
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update product'
    }, 400)
  }
})

const deleteProductRoute = createRoute({
  method: 'delete',
  path: '/:id',
  request: {
    params: z.object({
      id: z.string().uuid()
    })
  },
  responses: {
    200: {
      description: 'Product deleted',
      content: {
        'application/json': {
          schema: DeleteProductResponse
        }
      }
    },
    500: {
      description: 'Failed to delete product'
    }
  }
})

productRoutes.openapi(deleteProductRoute, async (c) => {
  try {
  const { id } = c.req.valid('param')

    await productService.deleteProduct(id)

    return c.json({
      success: true,
      message: 'Product deleted successfully'
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete product'
    }, 500)
  }
})

export default productRoutes
