'use client';

import React from 'react';
import { Header } from '../components/layout';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-white">
        <div className="flex flex-col h-screen">
          <Header />
          
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
