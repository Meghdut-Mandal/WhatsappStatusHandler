'use client';

import React, { Component, ReactNode } from 'react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
}

/**
 * Error boundary specifically designed for the contacts page
 * Provides graceful error handling and recovery options
 */
export class ContactsErrorBoundary extends Component<Props, State> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ContactsErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Call the onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log error details for debugging
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      retryCount: this.state.retryCount,
    };

    // In development, log full error details
    if (process.env.NODE_ENV === 'development') {
      console.group('🚨 Contacts Page Error Details');
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.error('Full Details:', errorDetails);
      console.groupEnd();
    }

    // In production, you might want to send this to an error reporting service
    // Example: Sentry, LogRocket, etc.
    if (process.env.NODE_ENV === 'production') {
      // sendErrorToService(errorDetails);
    }
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1,
    }));
  };

  handleAutoRetry = (delay: number = 5000) => {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }

    this.retryTimeoutId = setTimeout(() => {
      this.handleRetry();
    }, delay);
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  getErrorType = (error: Error): string => {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('fetch')) {
      return 'network';
    }
    if (message.includes('whatsapp') || message.includes('connection')) {
      return 'connection';
    }
    if (message.includes('database') || message.includes('prisma')) {
      return 'database';
    }
    if (message.includes('permission') || message.includes('unauthorized')) {
      return 'permission';
    }
    if (message.includes('timeout')) {
      return 'timeout';
    }
    
    return 'unknown';
  };

  getErrorMessage = (errorType: string, error: Error): string => {
    switch (errorType) {
      case 'network':
        return 'Network connection error. Please check your internet connection.';
      case 'connection':
        return 'WhatsApp connection error. Please reconnect to WhatsApp.';
      case 'database':
        return 'Data storage error. Your data may be temporarily unavailable.';
      case 'permission':
        return 'Permission error. Please reconnect to WhatsApp with proper authorization.';
      case 'timeout':
        return 'Operation timed out. The server may be experiencing high load.';
      default:
        return error.message || 'An unexpected error occurred in the contacts page.';
    }
  };

  getRecoveryActions = (errorType: string) => {
    const actions = [];

    switch (errorType) {
      case 'network':
        actions.push(
          { label: 'Retry', action: this.handleRetry, primary: true },
          { label: 'Auto-retry in 10s', action: () => this.handleAutoRetry(10000) },
          { label: 'Reload Page', action: this.handleReload }
        );
        break;
      case 'connection':
        actions.push(
          { label: 'Go to Auth Page', action: () => window.location.href = '/auth', primary: true },
          { label: 'Retry', action: this.handleRetry },
          { label: 'Reload Page', action: this.handleReload }
        );
        break;
      case 'database':
        actions.push(
          { label: 'Retry', action: this.handleRetry, primary: true },
          { label: 'Auto-retry in 5s', action: () => this.handleAutoRetry(5000) },
          { label: 'Go to Dashboard', action: this.handleGoHome }
        );
        break;
      case 'permission':
        actions.push(
          { label: 'Reconnect WhatsApp', action: () => window.location.href = '/auth', primary: true },
          { label: 'Go to Dashboard', action: this.handleGoHome }
        );
        break;
      case 'timeout':
        actions.push(
          { label: 'Retry', action: this.handleRetry, primary: true },
          { label: 'Auto-retry in 15s', action: () => this.handleAutoRetry(15000) },
          { label: 'Reload Page', action: this.handleReload }
        );
        break;
      default:
        actions.push(
          { label: 'Retry', action: this.handleRetry, primary: true },
          { label: 'Reload Page', action: this.handleReload },
          { label: 'Go to Dashboard', action: this.handleGoHome }
        );
        break;
    }

    return actions;
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // If a custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorType = this.getErrorType(this.state.error);
      const errorMessage = this.getErrorMessage(errorType, this.state.error);
      const recoveryActions = this.getRecoveryActions(errorType);

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            {/* Error Icon */}
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full">
              <svg 
                className="w-8 h-8 text-red-600" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                />
              </svg>
            </div>

            {/* Error Title */}
            <h1 className="text-xl font-semibold text-gray-900 text-center mb-2">
              Contacts Page Error
            </h1>

            {/* Error Message */}
            <p className="text-gray-600 text-center mb-6">
              {errorMessage}
            </p>

            {/* Retry Count */}
            {this.state.retryCount > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-yellow-800 text-center">
                  Retry attempt: {this.state.retryCount}
                  {this.state.retryCount >= 3 && (
                    <span className="block mt-1 text-xs">
                      Multiple failures detected. Consider reloading the page.
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Recovery Actions */}
            <div className="space-y-3">
              {recoveryActions.map((action, index) => (
                <Button
                  key={index}
                  onClick={action.action}
                  variant={action.primary ? 'default' : 'outline'}
                  className="w-full"
                  size="sm"
                >
                  {action.label}
                </Button>
              ))}
            </div>

            {/* Error Details (Development Only) */}
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-6 text-xs">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                  Show Error Details (Development)
                </summary>
                <div className="mt-2 p-3 bg-gray-100 rounded border text-gray-700 font-mono whitespace-pre-wrap">
                  <div className="mb-2">
                    <strong>Error:</strong> {this.state.error.message}
                  </div>
                  <div className="mb-2">
                    <strong>Type:</strong> {errorType}
                  </div>
                  <div className="mb-2">
                    <strong>Stack:</strong>
                    <pre className="text-xs mt-1 overflow-auto max-h-32">
                      {this.state.error.stack}
                    </pre>
                  </div>
                  {this.state.errorInfo && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre className="text-xs mt-1 overflow-auto max-h-32">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* Help Text */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                If this problem persists, try refreshing the page or contact support.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook version of the error boundary for functional components
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const handleError = React.useCallback((error: Error) => {
    console.error('useErrorHandler caught error:', error);
    setError(error);
  }, []);

  // Throw error to trigger error boundary
  if (error) {
    throw error;
  }

  return { handleError, resetError };
}