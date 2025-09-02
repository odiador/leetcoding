export class AppError extends Error {
  public statusCode: number
  public isOperational: boolean

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = isOperational
    this.name = this.constructor.name

    Error.captureStackTrace(this, this.constructor)
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400)
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403)
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409)
    this.name = 'ConflictError'
  }
}

// Error response formatter
export interface ErrorResponse {
  success: false
  error: string
  code?: string
  details?: any
}

export function formatError(error: Error): ErrorResponse {
  if (error instanceof AppError) {
    return {
      success: false,
      error: error.message,
      code: error.name,
      ...(error.isOperational && { details: error.stack })
    }
  }

  return {
    success: false,
    error: error.message || 'Internal server error',
    code: 'InternalError'
  }
}

// Async error wrapper for routes
export function asyncHandler(fn: Function) {
  return (c: any, next: any) => {
    return Promise.resolve(fn(c, next)).catch((error: Error) => {
      const errorResponse = formatError(error)
      const statusCode = error instanceof AppError ? error.statusCode : 500

      return c.json(errorResponse, statusCode)
    })
  }
}
