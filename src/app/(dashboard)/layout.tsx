'use client';

import React, { useState } from 'react';
import { Header, Sidebar, PageWrapper } from '../components/layout';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ErrorBoundary>
      <PageWrapper>
        <div className="flex h-screen overflow-hidden">
          <Sidebar 
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
          
          <div className="flex flex-col flex-1 overflow-hidden lg:pl-64">
            <Header 
              onMenuToggle={() => setSidebarOpen(true)}
              showMenuButton={true}
            />
            
            <div className="flex-1 overflow-auto">
              {children}
            </div>
          </div>
        </div>
      </PageWrapper>
    </ErrorBoundary>
  );
}
