import React from 'react';
import { cn } from '@/lib/utils/cn';

interface MainContentProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function MainContent({ 
  children, 
  className, 
  title, 
  subtitle, 
  actions 
}: MainContentProps) {
  return (
    <main className={cn('flex-1 overflow-auto', className)}>
      {(title || subtitle || actions) && (
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              {title && (
                <h1 className="text-2xl font-semibold text-gray-900">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="mt-1 text-sm text-gray-600">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex items-center space-x-3">
                {actions}
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="p-6">
        {children}
      </div>
    </main>
  );
}

interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export function PageWrapper({ children, className }: PageWrapperProps) {
  return (
    <div className={cn('min-h-screen bg-gray-50', className)}>
      {children}
    </div>
  );
}

interface ContentSectionProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
}

export function ContentSection({ 
  children, 
  className, 
  title, 
  description 
}: ContentSectionProps) {
  return (
    <section className={cn('bg-white rounded-lg border border-gray-200 p-6', className)}>
      {(title || description) && (
        <div className="mb-6">
          {title && (
            <h2 className="text-lg font-medium text-gray-900 mb-2">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-sm text-gray-600">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
