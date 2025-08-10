import React from 'react';
import { PageWrapper } from '../components/layout';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageWrapper>
      <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          {children}
        </div>
      </div>
    </PageWrapper>
  );
}
