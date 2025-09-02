// Basic validation utilities
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

export const isPositiveNumber = (value: any): boolean => {
  return typeof value === 'number' && value > 0 && Number.isFinite(value)
}

export const isNonEmptyString = (value: any): boolean => {
  return typeof value === 'string' && value.trim().length > 0
}

// Sanitize string input
export const sanitizeString = (input: string): string => {
  return input.trim().replace(/[<>]/g, '')
}

// Validate required fields in an object
export const validateRequired = (obj: Record<string, any>, requiredFields: string[]): string[] => {
  const missing: string[] = []
  for (const field of requiredFields) {
    if (!(field in obj) || obj[field] === null || obj[field] === undefined || obj[field] === '') {
      missing.push(field)
    }
  }
  return missing
}
