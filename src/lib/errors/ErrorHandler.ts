/**
 * Comprehensive Error Handling System
 * Week 4 - Developer A Implementation
 */

import { EventEmitter } from 'events';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  FILE_SYSTEM = 'file_system',
  DATABASE = 'database',
  WHATSAPP = 'whatsapp',
  UPLOAD = 'upload',
  VALIDATION = 'validation',
  SYSTEM = 'system',
  USER = 'user'
}

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, unknown>;
  // Additional context fields for specific use cases
  attempt?: number;
  messageId?: string;
  rule?: string;
  [key: string]: unknown; // Allow additional properties
}

export interface AppError {
  id: string;
  timestamp: Date;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  stack?: string;
  context?: ErrorContext;
  originalError?: Error;
  userMessage?: string;
  recoveryActions?: string[];
  isRecoverable: boolean;
}

export class ErrorHandler extends EventEmitter {
  private static instance: ErrorHandler;
  private errorHistory: AppError[] = [];
  private maxHistorySize = 1000;
  private recoveryStrategies: Map<string, () => Promise<boolean>> = new Map();

  private constructor() {
    super();
    this.setupGlobalErrorHandlers();
  }

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers() {
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.handleError(error, {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.HIGH,
        context: { component: 'global', action: 'unhandledRejection' }
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.handleError(error, {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.CRITICAL,
        context: { component: 'global', action: 'uncaughtException' }
      });
    });

    // Handle process warnings (but don't crash on deprecation warnings)
    process.on('warning', (warning) => {
      // Skip deprecation warnings to avoid crashes
      if (warning.name === 'DeprecationWarning') {
        console.warn(`[DEPRECATION] ${warning.message}`);
        return;
      }
      
      this.handleError(new Error(warning.message), {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.LOW,
        context: { 
          component: 'global', 
          action: 'processWarning',
          metadata: { name: warning.name, stack: warning.stack }
        }
      });
    });
  }

  /**
   * Handle and process errors
   */
  handleError(
    error: Error | unknown,
    options: {
      category: ErrorCategory;
      severity: ErrorSeverity;
      context?: ErrorContext;
      userMessage?: string;
      recoveryActions?: string[];
    }
  ): AppError {
    const actualError = error instanceof Error ? error : new Error(String(error));
    
    const appError: AppError = {
      id: this.generateErrorId(),
      timestamp: new Date(),
      message: actualError.message,
      category: options.category,
      severity: options.severity,
      stack: actualError.stack,
      context: options.context,
      originalError: actualError,
      userMessage: options.userMessage || this.generateUserMessage(options.category, actualError),
      recoveryActions: options.recoveryActions || this.generateRecoveryActions(options.category),
      isRecoverable: this.isRecoverable(options.category, options.severity)
    };

    // Add to history
    this.addToHistory(appError);

    // Log error
    this.logError(appError);

    // Emit error event
    this.emit('error', appError);

    // Attempt recovery if possible
    if (appError.isRecoverable) {
      this.attemptRecovery(appError);
    }

    return appError;
  }

  /**
   * Create specific error types
   */
  createNetworkError(error: Error, context?: ErrorContext): AppError {
    return this.handleError(error, {
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.MEDIUM,
      context,
      userMessage: 'Network connection issue. Please check your internet connection.',
      recoveryActions: ['Check internet connection', 'Retry operation', 'Try again later']
    });
  }

  createWhatsAppError(error: Error, context?: ErrorContext): AppError {
    return this.handleError(error, {
      category: ErrorCategory.WHATSAPP,
      severity: ErrorSeverity.HIGH,
      context,
      userMessage: 'WhatsApp connection issue. Please reconnect your account.',
      recoveryActions: ['Reconnect WhatsApp', 'Scan QR code again', 'Check phone connection']
    });
  }

  createUploadError(error: Error, context?: ErrorContext): AppError {
    return this.handleError(error, {
      category: ErrorCategory.UPLOAD,
      severity: ErrorSeverity.MEDIUM,
      context,
      userMessage: 'File upload failed. Please try uploading again.',
      recoveryActions: ['Retry upload', 'Check file size', 'Check file format']
    });
  }

  createDatabaseError(error: Error, context?: ErrorContext): AppError {
    return this.handleError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context,
      userMessage: 'Database error occurred. Your data may not be saved.',
      recoveryActions: ['Restart application', 'Check disk space', 'Contact support']
    });
  }

  createValidationError(message: string, context?: ErrorContext): AppError {
    return this.handleError(new Error(message), {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      context,
      userMessage: 'Please check your input and try again.',
      recoveryActions: ['Verify input format', 'Check required fields', 'Try different values']
    });
  }

  /**
   * Register recovery strategy
   */
  registerRecoveryStrategy(errorType: string, strategy: () => Promise<boolean>) {
    this.recoveryStrategies.set(errorType, strategy);
  }

  /**
   * Attempt error recovery
   */
  private async attemptRecovery(appError: AppError): Promise<boolean> {
    const strategyKey = `${appError.category}_${appError.severity}`;
    const strategy = this.recoveryStrategies.get(strategyKey) || 
                    this.recoveryStrategies.get(appError.category);

    if (strategy) {
      try {
        const recovered = await strategy();
        if (recovered) {
          this.emit('recovery_success', appError);
          return true;
        }
      } catch (recoveryError) {
        this.handleError(recoveryError, {
          category: ErrorCategory.SYSTEM,
          severity: ErrorSeverity.MEDIUM,
          context: { 
            component: 'ErrorHandler', 
            action: 'recovery_failed',
            metadata: { originalErrorId: appError.id }
          }
        });
      }
    }

    this.emit('recovery_failed', appError);
    return false;
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    bySeverity: Record<ErrorSeverity, number>;
    byCategory: Record<ErrorCategory, number>;
    recent: AppError[];
  } {
    const stats = {
      total: this.errorHistory.length,
      bySeverity: {} as Record<ErrorSeverity, number>,
      byCategory: {} as Record<ErrorCategory, number>,
      recent: this.errorHistory.slice(-10)
    };

    // Initialize counters
    Object.values(ErrorSeverity).forEach(severity => {
      stats.bySeverity[severity] = 0;
    });
    Object.values(ErrorCategory).forEach(category => {
      stats.byCategory[category] = 0;
    });

    // Count errors
    this.errorHistory.forEach(error => {
      stats.bySeverity[error.severity]++;
      stats.byCategory[error.category]++;
    });

    return stats;
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
    this.emit('history_cleared');
  }

  /**
   * Get error by ID
   */
  getErrorById(id: string): AppError | undefined {
    return this.errorHistory.find(error => error.id === id);
  }

  /**
   * Get errors by category
   */
  getErrorsByCategory(category: ErrorCategory): AppError[] {
    return this.errorHistory.filter(error => error.category === category);
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 50): AppError[] {
    return this.errorHistory.slice(-limit);
  }

  /**
   * Private helper methods
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateUserMessage(category: ErrorCategory, error: Error): string {
    const messages = {
      [ErrorCategory.NETWORK]: 'Network connection issue. Please check your internet connection.',
      [ErrorCategory.AUTHENTICATION]: 'Authentication failed. Please sign in again.',
      [ErrorCategory.FILE_SYSTEM]: 'File system error. Please check file permissions.',
      [ErrorCategory.DATABASE]: 'Database error. Your data may not be saved.',
      [ErrorCategory.WHATSAPP]: 'WhatsApp connection issue. Please reconnect.',
      [ErrorCategory.UPLOAD]: 'File upload failed. Please try again.',
      [ErrorCategory.VALIDATION]: 'Invalid input. Please check your data.',
      [ErrorCategory.SYSTEM]: 'System error occurred. Please try again.',
      [ErrorCategory.USER]: 'An error occurred. Please try again.'
    };

    return messages[category] || 'An unexpected error occurred.';
  }

  private generateRecoveryActions(category: ErrorCategory): string[] {
    const actions = {
      [ErrorCategory.NETWORK]: ['Check internet connection', 'Retry operation', 'Try again later'],
      [ErrorCategory.AUTHENTICATION]: ['Sign in again', 'Check credentials', 'Reset password'],
      [ErrorCategory.FILE_SYSTEM]: ['Check file permissions', 'Try different location', 'Restart app'],
      [ErrorCategory.DATABASE]: ['Restart application', 'Check disk space', 'Contact support'],
      [ErrorCategory.WHATSAPP]: ['Reconnect WhatsApp', 'Scan QR code', 'Check phone connection'],
      [ErrorCategory.UPLOAD]: ['Retry upload', 'Check file size', 'Check file format'],
      [ErrorCategory.VALIDATION]: ['Check input format', 'Verify required fields', 'Try different values'],
      [ErrorCategory.SYSTEM]: ['Restart application', 'Check system resources', 'Contact support'],
      [ErrorCategory.USER]: ['Try again', 'Check your input', 'Contact support if issue persists']
    };

    return actions[category] || ['Try again', 'Contact support'];
  }

  private isRecoverable(category: ErrorCategory, severity: ErrorSeverity): boolean {
    if (severity === ErrorSeverity.CRITICAL) return false;
    
    const recoverableCategories = [
      ErrorCategory.NETWORK,
      ErrorCategory.UPLOAD,
      ErrorCategory.VALIDATION,
      ErrorCategory.WHATSAPP
    ];

    return recoverableCategories.includes(category);
  }

  private addToHistory(error: AppError): void {
    this.errorHistory.push(error);
    
    // Trim history if too large
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
    }
  }

  private logError(error: AppError): void {
    const logLevel = this.getLogLevel(error.severity);
    const logMessage = `[${error.category.toUpperCase()}] ${error.message}`;
    
    console[logLevel](logMessage, {
      id: error.id,
      timestamp: error.timestamp,
      context: error.context,
      stack: error.stack
    });
  }

  private getLogLevel(severity: ErrorSeverity): 'log' | 'warn' | 'error' {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 'log';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.HIGH:
      case ErrorSeverity.CRITICAL:
        return 'error';
      default:
        return 'error';
    }
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();

// Utility functions for common error patterns
export function withErrorHandling<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  category: ErrorCategory,
  context?: ErrorContext
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      errorHandler.handleError(error, {
        category,
        severity: ErrorSeverity.MEDIUM,
        context
      });
      throw error;
    }
  };
}

export function createErrorBoundaryWrapper(category: ErrorCategory) {
  return (error: Error, context?: ErrorContext) => {
    return errorHandler.handleError(error, {
      category,
      severity: ErrorSeverity.HIGH,
      context
    });
  };
}
