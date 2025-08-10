'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header, Sidebar, PageWrapper, MainContent, ContentSection } from './components/layout';
import { Button } from './components/ui/Button';
import { ConnectionStatus } from './components/ui/ConnectionStatus';
import { LoadingSpinner } from './components/ui/Loading';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

interface DashboardStats {
  totalSent: number;
  successRate: number;
  activeSession: boolean;
  lastActivity?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Check connection status
        const statusResponse = await fetch('/api/auth/status');
        const statusData = await statusResponse.json();
        
        // For now, set mock stats - in Week 2 this will fetch real data
        setStats({
          totalSent: 0,
          successRate: 0,
          activeSession: statusData.success && statusData.status === 'connected',
          lastActivity: statusData.session?.lastSeenAt,
        });
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
        setStats({
          totalSent: 0,
          successRate: 0,
          activeSession: false,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const handleConnectToWhatsApp = () => {
    router.push('/auth');
  };

  const handleUploadFiles = () => {
    router.push('/upload');
  };

  const handleViewHistory = () => {
    router.push('/history');
  };

  if (loading) {
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
                <MainContent title="Dashboard" subtitle="Welcome to WhatsApp Status Handler">
                  <div className="flex justify-center items-center h-64">
                    <LoadingSpinner size="lg" />
                  </div>
                </MainContent>
              </div>
            </div>
          </div>
        </PageWrapper>
      </ErrorBoundary>
    );
  }

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
              <MainContent 
                title="Dashboard" 
                subtitle="Welcome to WhatsApp Status Handler"
                actions={
                  <ConnectionStatus showDetails />
                }
              >
      <div className="space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ContentSection className="text-center">
            <div className="space-y-2">
              <div className="text-2xl font-semibold text-gray-900">
                {stats?.totalSent || 0}
              </div>
              <div className="text-sm text-gray-600">Files Sent</div>
            </div>
          </ContentSection>
          
          <ContentSection className="text-center">
            <div className="space-y-2">
              <div className="text-2xl font-semibold text-gray-900">
                {stats?.successRate || 0}%
              </div>
              <div className="text-sm text-gray-600">Success Rate</div>
            </div>
          </ContentSection>
          
          <ContentSection className="text-center">
            <div className="space-y-2">
              <div className="text-2xl font-semibold text-gray-900">
                {stats?.activeSession ? 'Active' : 'Inactive'}
              </div>
              <div className="text-sm text-gray-600">Connection Status</div>
            </div>
          </ContentSection>
        </div>

        {/* Quick Actions */}
        <ContentSection 
          title="Quick Actions" 
          description="Get started with these common tasks"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Button 
              onClick={handleConnectToWhatsApp}
              className="h-auto p-6 flex flex-col items-center space-y-3"
              variant={stats?.activeSession ? "outline" : "default"}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
              <span className="font-medium">
                {stats?.activeSession ? 'Manage Connection' : 'Connect to WhatsApp'}
              </span>
              <span className="text-xs opacity-75">
                {stats?.activeSession ? 'View connection details' : 'Scan QR code to connect'}
              </span>
            </Button>

            <Button 
              onClick={handleUploadFiles}
              className="h-auto p-6 flex flex-col items-center space-y-3"
              variant="outline"
              disabled={!stats?.activeSession}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="font-medium">Upload & Send</span>
              <span className="text-xs opacity-75">
                Send photos and videos to status
              </span>
            </Button>

            <Button 
              onClick={handleViewHistory}
              className="h-auto p-6 flex flex-col items-center space-y-3"
              variant="outline"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">View History</span>
              <span className="text-xs opacity-75">
                See your sent files
              </span>
            </Button>
          </div>
        </ContentSection>

        {/* Getting Started */}
        {!stats?.activeSession && (
          <ContentSection 
            title="Getting Started" 
            description="Follow these steps to start sending files to WhatsApp Status"
          >
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-blue-600">1</span>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Connect to WhatsApp</h3>
                  <p className="text-sm text-gray-600">
                    Scan the QR code with your WhatsApp mobile app to establish a connection.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-gray-400">2</span>
                </div>
                <div>
                  <h3 className="font-medium text-gray-400">Upload Files</h3>
                  <p className="text-sm text-gray-400">
                    Upload photos or videos that you want to share to your WhatsApp Status.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-gray-400">3</span>
                </div>
                <div>
                  <h3 className="font-medium text-gray-400">Send to Status</h3>
                  <p className="text-sm text-gray-400">
                    Send your files directly to WhatsApp Status without compression.
                  </p>
                </div>
              </div>
            </div>
          </ContentSection>
        )}
      </div>
              </MainContent>
            </div>
          </div>
        </div>
      </PageWrapper>
    </ErrorBoundary>
  );
}
