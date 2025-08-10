import React from 'react';
import { cn } from '@/lib/utils/cn';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  text?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

export function Loading({ size = 'md', className, text }: LoadingProps) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div className="flex flex-col items-center space-y-2">
        <div
          className={cn(
            'animate-spin rounded-full border-2 border-gray-300 border-t-blue-600',
            sizeClasses[size]
          )}
        />
        {text && <p className="text-sm text-gray-600">{text}</p>}
      </div>
    </div>
  );
}

export function LoadingSpinner({ size = 'md', className }: Omit<LoadingProps, 'text'>) {
  return (
    <div
      className={cn(
        'animate-spin rounded-full border-2 border-gray-300 border-t-blue-600',
        sizeClasses[size],
        className
      )}
    />
  );
}

export function LoadingDots({ className }: { className?: string }) {
  return (
    <div className={cn('flex space-x-1', className)}>
      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
    </div>
  );
}
