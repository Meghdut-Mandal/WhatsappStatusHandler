/**
 * Standardized API error response utilities
 * Provides consistent error formatting across all contact/group endpoints
 */

export interface ApiErrorAction {
  type: 'retry' | 'force_sync' | 'incremental_sync' | 'reconnect' | 'wait' | 'check_status';
  label: string;
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, any>;
  delay?: number;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
  message: string;
  timestamp: string;
  suggestion?: string;
  actions?: ApiErrorAction[];
  retryAfter?: number;
  details?: string;
  debug?: {
    stack?: string;
    type?: string;
    name?: string;
  };
}

export interface ApiSuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
  timestamp?: string;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// Standard error codes
export const ERROR_CODES = {
  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_PARAMETERS: 'INVALID_PARAMETERS',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Authentication/Authorization errors (401/403)
  UNAUTHORIZED: 'UNAUTHORIZED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  
  // Not found errors (404)
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CONTACT_NOT_FOUND: 'CONTACT_NOT_FOUND',
  GROUP_NOT_FOUND: 'GROUP_NOT_FOUND',
  
  // Conflict errors (409)
  SYNC_IN_PROGRESS: 'SYNC_IN_PROGRESS',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  
  // Rate limiting (429)
  RATE_LIMITED: 'RATE_LIMITED',
  RECENT_SYNC_EXISTS: 'RECENT_SYNC_EXISTS',
  
  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  SYNC_FAILED: 'SYNC_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  
  // Service unavailable (503)
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  WHATSAPP_DISCONNECTED: 'WHATSAPP_DISCONNECTED',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  
  // Timeout errors (504)
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  SYNC_TIMEOUT: 'SYNC_TIMEOUT',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  options: {
    suggestion?: string;
    actions?: ApiErrorAction[];
    retryAfter?: number;
    details?: string;
    debug?: {
      stack?: string;
      type?: string;
      name?: string;
    };
  } = {}
): ApiErrorResponse {
  return {
    success: false,
    error: code,
    code,
    message,
    timestamp: new Date().toISOString(),
    suggestion: options.suggestion,
    actions: options.actions,
    retryAfter: options.retryAfter,
    details: options.details,
    debug: process.env.NODE_ENV === 'development' ? options.debug : undefined,
  };
}

/**
 * Creates a standardized success response
 */
export function createSuccessResponse<T>(
  data?: T,
  message?: string
): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Maps common error types to standardized error responses
 */
export function mapErrorToResponse(error: Error | unknown): ApiErrorResponse {
  const timestamp = new Date().toISOString();
  
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    
    // WhatsApp connection errors
    if (errorMessage.includes('whatsapp not connected') || 
        errorMessage.includes('connection not available')) {
      return createErrorResponse(
        ERROR_CODES.WHATSAPP_DISCONNECTED,
        'WhatsApp connection is not available',
        {
          suggestion: 'Please connect to WhatsApp and try again',
          actions: [
            {
              type: 'reconnect',
              label: 'Reconnect WhatsApp',
              endpoint: '/api/auth/qr',
              method: 'GET'
            },
            {
              type: 'retry',
              label: 'Retry Operation',
              delay: 10000
            }
          ],
          details: error.message,
          debug: {
            stack: error.stack,
            type: typeof error,
            name: error.name
          }
        }
      );
    }
    
    // Database errors
    if (errorMessage.includes('database') || 
        errorMessage.includes('prisma') ||
        errorMessage.includes('sqlite')) {
      return createErrorResponse(
        ERROR_CODES.DATABASE_ERROR,
        'Database operation failed',
        {
          suggestion: 'Please try again. If the problem persists, contact support',
          actions: [
            {
              type: 'retry',
              label: 'Retry Operation',
              delay: 5000
            }
          ],
          details: error.message,
          debug: {
            stack: error.stack,
            type: typeof error,
            name: error.name
          }
        }
      );
    }
    
    // Timeout errors
    if (errorMessage.includes('timeout') || 
        errorMessage.includes('timed out')) {
      return createErrorResponse(
        ERROR_CODES.TIMEOUT_ERROR,
        'Operation timed out',
        {
          suggestion: 'The operation took too long to complete. Please try again',
          actions: [
            {
              type: 'retry',
              label: 'Retry Operation',
              delay: 5000
            }
          ],
          details: error.message,
          debug: {
            stack: error.stack,
            type: typeof error,
            name: error.name
          }
        }
      );
    }
    
    // Network errors
    if (errorMessage.includes('network') || 
        errorMessage.includes('fetch') ||
        errorMessage.includes('connection refused')) {
      return createErrorResponse(
        ERROR_CODES.NETWORK_ERROR,
        'Network error occurred',
        {
          suggestion: 'Please check your internet connection and try again',
          actions: [
            {
              type: 'retry',
              label: 'Retry Operation',
              delay: 10000
            }
          ],
          details: error.message,
          debug: {
            stack: error.stack,
            type: typeof error,
            name: error.name
          }
        }
      );
    }
    
    // Permission errors
    if (errorMessage.includes('permission') || 
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('forbidden')) {
      return createErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        'Permission denied',
        {
          suggestion: 'You do not have permission to perform this operation',
          actions: [
            {
              type: 'reconnect',
              label: 'Reconnect WhatsApp',
              endpoint: '/api/auth/qr',
              method: 'GET'
            }
          ],
          details: error.message,
          debug: {
            stack: error.stack,
            type: typeof error,
            name: error.name
          }
        }
      );
    }
    
    // Sync-specific errors
    if (errorMessage.includes('recent sync exists')) {
      return createErrorResponse(
        ERROR_CODES.RECENT_SYNC_EXISTS,
        error.message,
        {
          suggestion: 'Use force=true to override recent sync or wait before retrying',
          retryAfter: 300,
          actions: [
            {
              type: 'force_sync',
              label: 'Force Sync Now',
              endpoint: '/api/contacts',
              method: 'POST',
              body: { force: true }
            },
            {
              type: 'wait',
              label: 'Wait and Retry',
              delay: 300000
            }
          ],
          details: error.message,
          debug: {
            stack: error.stack,
            type: typeof error,
            name: error.name
          }
        }
      );
    }
    
    if (errorMessage.includes('sync already in progress')) {
      return createErrorResponse(
        ERROR_CODES.SYNC_IN_PROGRESS,
        error.message,
        {
          suggestion: 'Wait for current sync to complete or check sync status',
          actions: [
            {
              type: 'check_status',
              label: 'Check Status',
              endpoint: '/api/sync/status',
              method: 'GET'
            },
            {
              type: 'wait',
              label: 'Wait and Retry',
              delay: 30000
            }
          ],
          details: error.message,
          debug: {
            stack: error.stack,
            type: typeof error,
            name: error.name
          }
        }
      );
    }
    
    // Generic error fallback
    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      error.message || 'An unexpected error occurred',
      {
        suggestion: 'Please try again. If the problem persists, contact support',
        actions: [
          {
            type: 'retry',
            label: 'Retry Operation',
            delay: 5000
          }
        ],
        details: error.message,
        debug: {
          stack: error.stack,
          type: typeof error,
          name: error.name
        }
      }
    );
  }
  
  // Non-Error objects
  return createErrorResponse(
    ERROR_CODES.INTERNAL_ERROR,
    'An unknown error occurred',
    {
      suggestion: 'Please try again. If the problem persists, contact support',
      actions: [
        {
          type: 'retry',
          label: 'Retry Operation',
          delay: 5000
        }
      ],
      details: String(error),
      debug: {
        type: typeof error,
        name: 'Unknown'
      }
    }
  );
}

/**
 * Validation error helpers
 */
export function createValidationError(
  field: string,
  message: string,
  value?: any
): ApiErrorResponse {
  return createErrorResponse(
    ERROR_CODES.VALIDATION_ERROR,
    `Validation failed for field '${field}': ${message}`,
    {
      suggestion: 'Please check your input and try again',
      details: `Field: ${field}, Value: ${value}, Error: ${message}`
    }
  );
}

/**
 * Not found error helpers
 */
export function createNotFoundError(
  resource: string,
  id?: string
): ApiErrorResponse {
  return createErrorResponse(
    ERROR_CODES.RESOURCE_NOT_FOUND,
    `${resource} not found${id ? ` with ID: ${id}` : ''}`,
    {
      suggestion: 'Please check the resource ID and try again',
      details: `Resource: ${resource}${id ? `, ID: ${id}` : ''}`
    }
  );
}

/**
 * Rate limiting error helpers
 */
export function createRateLimitError(
  retryAfter: number = 60,
  message?: string
): ApiErrorResponse {
  return createErrorResponse(
    ERROR_CODES.RATE_LIMITED,
    message || 'Too many requests. Please try again later.',
    {
      suggestion: `Please wait ${retryAfter} seconds before trying again`,
      retryAfter,
      actions: [
        {
          type: 'wait',
          label: `Wait ${retryAfter}s and Retry`,
          delay: retryAfter * 1000
        }
      ]
    }
  );
}