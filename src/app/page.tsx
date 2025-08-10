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

export default function HomePage() {
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
              <div className="relative">
                {/* Hero Section */}
                <div className="bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 border-b border-gray-200">
                  <div className="px-6 py-8">
                    <div className="max-w-4xl">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h1 className="text-3xl font-bold text-gray-900 mb-2">
                            Welcome to WhatsApp Status Handler
                          </h1>
                          <p className="text-lg text-gray-600">
                            Send media without compression • Share moments in full quality
                          </p>
                        </div>
                      </div>
                      
                      {/* Quick Stats Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-white/50 shadow-sm hover-lift animate-fade-in-up" style={{animationDelay: '0.1s'}}>
                          <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center animate-float">
                              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 12l2 2 4-4" />
                              </svg>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-gray-900">
                                {stats?.totalSent || 0}
                              </div>
                              <div className="text-sm text-gray-600">Files Sent</div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-white/50 shadow-sm hover-lift animate-fade-in-up" style={{animationDelay: '0.2s'}}>
                          <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center animate-float" style={{animationDelay: '0.5s'}}>
                              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-gray-900">
                                {stats?.successRate || 0}%
                              </div>
                              <div className="text-sm text-gray-600">Success Rate</div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-white/50 shadow-sm hover-lift animate-fade-in-up" style={{animationDelay: '0.3s'}}>
                          <div className="flex items-center space-x-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center animate-float ${stats?.activeSession ? 'bg-green-100' : 'bg-gray-100'}`} style={{animationDelay: '1s'}}>
                              <svg className={`w-6 h-6 ${stats?.activeSession ? 'text-green-600' : 'text-gray-400'} ${stats?.activeSession ? 'animate-pulse-soft' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                            </div>
                            <div>
                              <div className={`text-2xl font-bold ${stats?.activeSession ? 'text-green-600' : 'text-gray-400'}`}>
                                {stats?.activeSession ? 'Active' : 'Inactive'}
                              </div>
                              <div className="text-sm text-gray-600">Connection Status</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Main Content */}
                <div className="p-6 space-y-8">
                  {/* Quick Actions */}
                  <div className="max-w-4xl animate-slide-in-left">
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2 gradient-text">Quick Actions</h2>
                      <p className="text-gray-600">Get started with these common tasks</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Connect Action */}
                      <div 
                        onClick={handleConnectToWhatsApp}
                        className={`group cursor-pointer relative overflow-hidden rounded-2xl p-8 transition-all duration-300 hover:scale-105 hover:shadow-xl ${
                          stats?.activeSession 
                            ? 'bg-gradient-to-br from-green-500 to-green-600 text-white' 
                            : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
                        }`}
                      >
                        <div className="relative z-10">
                          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-white/30 transition-colors">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <h3 className="text-xl font-bold mb-2">
                            {stats?.activeSession ? 'Manage Connection' : 'Connect to WhatsApp'}
                          </h3>
                          <p className="text-white/80 text-sm">
                            {stats?.activeSession ? 'View connection details' : 'Scan QR code to connect'}
                          </p>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>

                      {/* Upload Action */}
                      <div 
                        onClick={handleUploadFiles}
                        className={`group cursor-pointer relative overflow-hidden rounded-2xl p-8 transition-all duration-300 hover:scale-105 ${
                          stats?.activeSession 
                            ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white hover:shadow-xl' 
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <div className="relative z-10">
                          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
                            stats?.activeSession 
                              ? 'bg-white/20 group-hover:bg-white/30' 
                              : 'bg-gray-200'
                          }`}>
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                          </div>
                          <h3 className="text-xl font-bold mb-2">Upload & Send</h3>
                          <p className={`text-sm ${stats?.activeSession ? 'text-white/80' : 'text-gray-500'}`}>
                            Send photos and videos to status
                          </p>
                        </div>
                        {stats?.activeSession && (
                          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>

                      {/* History Action */}
                      <div 
                        onClick={handleViewHistory}
                        className="group cursor-pointer relative overflow-hidden rounded-2xl p-8 bg-gradient-to-br from-indigo-500 to-purple-600 text-white transition-all duration-300 hover:scale-105 hover:shadow-xl"
                      >
                        <div className="relative z-10">
                          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-white/30 transition-colors">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <h3 className="text-xl font-bold mb-2">View History</h3>
                          <p className="text-white/80 text-sm">
                            See your sent files
                          </p>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </div>

                  {/* Getting Started */}
                  {!stats?.activeSession && (
                    <div className="max-w-4xl animate-fade-in-up" style={{animationDelay: '0.4s'}}>
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 hover-lift">
                        <div className="mb-8">
                          <h2 className="text-2xl font-bold text-gray-900 mb-2 gradient-text">Getting Started</h2>
                          <p className="text-gray-600">Follow these steps to start sending files to WhatsApp Status</p>
                        </div>
                        
                        <div className="space-y-6">
                          <div className="flex items-start space-x-4 animate-slide-in-left" style={{animationDelay: '0.5s'}}>
                            <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-sm animate-pulse-soft">
                              <span className="text-lg font-bold text-white">1</span>
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold text-gray-900 mb-1">Connect to WhatsApp</h3>
                              <p className="text-gray-600 leading-relaxed">
                                Scan the QR code with your WhatsApp mobile app to establish a secure connection.
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-start space-x-4 animate-slide-in-left" style={{animationDelay: '0.6s'}}>
                            <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                              <span className="text-lg font-bold text-gray-400">2</span>
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg font-medium text-gray-400 mb-1">Upload Files</h3>
                              <p className="text-gray-400 leading-relaxed">
                                Upload photos or videos that you want to share to your WhatsApp Status.
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-start space-x-4 animate-slide-in-left" style={{animationDelay: '0.7s'}}>
                            <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                              <span className="text-lg font-bold text-gray-400">3</span>
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg font-medium text-gray-400 mb-1">Send to Status</h3>
                              <p className="text-gray-400 leading-relaxed">
                                Send your files directly to WhatsApp Status without any compression.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </PageWrapper>
    </ErrorBoundary>
  );
}
