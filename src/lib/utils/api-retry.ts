/**
 * API retry mechanism utilities
 * Provides intelligent retry logic for failed API requests
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryCondition?: (error: any, attempt: number) => boolean;
  onRetry?: (error: any, attempt: number) => void;
  onMaxRetriesReached?: (error: any) => void;
}

export interface RetryableError extends Error {
  isRetryable?: boolean;
  retryAfter?: number;
  statusCode?: number;
}

/**
 * Default retry condition - determines if an error should trigger a retry
 */
export function defaultRetryCondition(error: any, attempt: number): boolean {
  // Don't retry after max attempts
  if (attempt >= 3) return false;

  // Check if it's a network error
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Check HTTP status codes
  if (error.statusCode) {
    // Retry on server errors (5xx) and some client errors
    if (error.statusCode >= 500) return true;
    if (error.statusCode === 408) return true; // Request Timeout
    if (error.statusCode === 429) return true; // Too Many Requests
    if (error.statusCode === 502) return true; // Bad Gateway
    if (error.statusCode === 503) return true; // Service Unavailable
    if (error.statusCode === 504) return true; // Gateway Timeout
  }

  // Check error messages for retryable conditions
  if (error.message) {
    const message = error.message.toLowerCase();
    if (message.includes('network')) return true;
    if (message.includes('timeout')) return true;
    if (message.includes('connection')) return true;
    if (message.includes('temporary')) return true;
  }

  // Check if error explicitly marked as retryable
  if (error.isRetryable === true) return true;
  if (error.isRetryable === false) return false;

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateDelay(
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000,
  backoffFactor: number = 2
): number {
  const exponentialDelay = baseDelay * Math.pow(backoffFactor, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  
  // Add jitter to prevent thundering herd
  const jitter = cappedDelay * 0.1 * Math.random();
  
  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleep utility for delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for async functions
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    retryCondition = defaultRetryCondition,
    onRetry,
    onMaxRetriesReached,
  } = options;

  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on the last attempt
      if (attempt > maxRetries) {
        if (onMaxRetriesReached) {
          onMaxRetriesReached(error);
        }
        throw error;
      }
      
      // Check if we should retry this error
      if (!retryCondition(error, attempt)) {
        throw error;
      }
      
      // Calculate delay (respect retryAfter if provided)
      let delay = calculateDelay(attempt, baseDelay, maxDelay, backoffFactor);
      
      if (error.retryAfter && typeof error.retryAfter === 'number') {
        delay = Math.max(delay, error.retryAfter * 1000);
      }
      
      // Call retry callback
      if (onRetry) {
        onRetry(error, attempt);
      }
      
      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Retry wrapper specifically for fetch requests
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  return withRetry(async () => {
    const response = await fetch(url, init);
    
    // Convert HTTP errors to retryable errors
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as RetryableError;
      error.statusCode = response.status;
      
      // Check for retry-after header
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        error.retryAfter = parseInt(retryAfter, 10);
      }
      
      // Mark certain status codes as retryable
      error.isRetryable = response.status >= 500 || 
                         response.status === 408 || 
                         response.status === 429 ||
                         response.status === 502 ||
                         response.status === 503 ||
                         response.status === 504;
      
      throw error;
    }
    
    return response;
  }, options);
}

/**
 * API client with built-in retry logic
 */
export class RetryableApiClient {
  private baseUrl: string;
  private defaultOptions: RetryOptions;
  private defaultHeaders: Record<string, string>;

  constructor(
    baseUrl: string = '',
    defaultOptions: RetryOptions = {},
    defaultHeaders: Record<string, string> = {}
  ) {
    this.baseUrl = baseUrl;
    this.defaultOptions = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      ...defaultOptions,
    };
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...defaultHeaders,
    };
  }

  private async request<T>(
    endpoint: string,
    init: RequestInit = {},
    retryOptions: RetryOptions = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const options = { ...this.defaultOptions, ...retryOptions };
    
    const requestInit: RequestInit = {
      ...init,
      headers: {
        ...this.defaultHeaders,
        ...init.headers,
      },
    };

    const response = await fetchWithRetry(url, requestInit, options);
    
    // Parse JSON response
    const data = await response.json();
    
    // Handle API error responses
    if (!data.success && data.error) {
      const error = new Error(data.message || data.error) as RetryableError;
      error.statusCode = response.status;
      
      // Check if the API response indicates retryability
      if (data.retryAfter) {
        error.retryAfter = data.retryAfter;
        error.isRetryable = true;
      }
      
      // Check error codes for retryability
      if (data.code) {
        const retryableCodes = [
          'NETWORK_ERROR',
          'TIMEOUT_ERROR',
          'SYNC_TIMEOUT',
          'DATABASE_ERROR',
          'SERVICE_UNAVAILABLE',
          'CONNECTION_ERROR',
          'RATE_LIMITED',
        ];
        error.isRetryable = retryableCodes.includes(data.code);
      }
      
      throw error;
    }
    
    return data;
  }

  async get<T>(endpoint: string, retryOptions?: RetryOptions): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' }, retryOptions);
  }

  async post<T>(
    endpoint: string,
    body?: any,
    retryOptions?: RetryOptions
  ): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      },
      retryOptions
    );
  }

  async put<T>(
    endpoint: string,
    body?: any,
    retryOptions?: RetryOptions
  ): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: 'PUT',
        body: body ? JSON.stringify(body) : undefined,
      },
      retryOptions
    );
  }

  async delete<T>(endpoint: string, retryOptions?: RetryOptions): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' }, retryOptions);
  }
}

/**
 * Default API client instance
 */
export const apiClient = new RetryableApiClient('/api', {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  onRetry: (error, attempt) => {
    console.warn(`API request failed (attempt ${attempt}):`, error.message);
  },
  onMaxRetriesReached: (error) => {
    console.error('API request failed after all retries:', error.message);
  },
});

/**
 * Specialized retry options for different types of operations
 */
export const RETRY_PRESETS = {
  // Quick operations (favorites, simple updates)
  quick: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 5000,
  },
  
  // Standard operations (data fetching)
  standard: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 15000,
  },
  
  // Long operations (sync, bulk operations)
  long: {
    maxRetries: 5,
    baseDelay: 2000,
    maxDelay: 60000,
  },
  
  // Critical operations (authentication, connection)
  critical: {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 1.5, // Slower backoff for critical operations
  },
} as const;