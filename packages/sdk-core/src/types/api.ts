export interface ApiError {
  readonly code: string
  readonly message: string
  readonly details?: unknown
}

export interface ApiMeta {
  readonly total?: number
  readonly page?: number
  readonly limit?: number
}

export interface ApiResponse<T> {
  readonly success: boolean
  readonly data?: T
  readonly error?: ApiError
  readonly meta?: ApiMeta
}

export function ok<T>(data: T, meta?: ApiMeta): ApiResponse<T> {
  return meta ? { success: true, data, meta } : { success: true, data }
}

export function err(
  code: string,
  message: string,
  details?: unknown,
): ApiResponse<never> {
  return {
    success: false,
    error: details === undefined ? { code, message } : { code, message, details },
  }
}
