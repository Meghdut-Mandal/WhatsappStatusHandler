'use client';

import React from 'react';
import { Button } from './Button';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });
    console.error('Error caught by boundary:', error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error} resetError={this.resetError} />;
      }

      return <DefaultErrorFallback error={this.state.error} resetError={this.resetError} />;
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

export function DefaultErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div 
      className="flex flex-col items-center justify-center min-h-64 p-6"
      role="alert"
      aria-live="assertive"
      aria-labelledby="error-title"
      aria-describedby="error-description"
    >
      <div className="text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg 
            className="w-8 h-8 text-red-600" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.232 15.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 id="error-title" className="text-lg font-medium text-gray-900 mb-2">
          Something went wrong
        </h2>
        <p id="error-description" className="text-sm text-gray-600 mb-4 max-w-md">
          An unexpected error occurred. Please try again or contact support if the problem persists.
        </p>
        
        <div className="space-y-2">
          <Button 
            onClick={resetError} 
            className="w-full sm:w-auto"
            aria-describedby="error-description"
          >
            Try Again
          </Button>
          <details className="mt-4">
            <summary 
              className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
              aria-label="Toggle error details visibility"
            >
              Show error details
            </summary>
            <div className="mt-2 p-3 bg-gray-100 rounded-md text-left">
              <pre 
                className="text-xs text-gray-700 whitespace-pre-wrap"
                role="region"
                aria-label="Error details"
              >
                {error.message}
                {process.env.NODE_ENV === 'development' && (
                  <>
                    {'\n\n'}
                    {error.stack}
                  </>
                )}
              </pre>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
