'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MainContent } from '../../components/layout';
import { LoadingSpinner } from '../../components/ui/Loading';

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

  // Refresh connection status to keep Quick Actions in sync without manual reload
  const refreshConnectionStatus = async () => {
    try {
      const statusResponse = await fetch('/api/auth/status', { cache: 'no-store' });
      const statusData = await statusResponse.json();
      setStats(prev => ({
        totalSent: prev?.totalSent ?? 0,
        successRate: prev?.successRate ?? 0,
        activeSession: Boolean(statusData.success && statusData.status === 'connected'),
        lastActivity: statusData.session?.lastSeenAt,
      }));
    } catch {
      // Ignore transient errors during background refresh
    }
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Check connection status
        const statusResponse = await fetch('/api/auth/status', { cache: 'no-store' });
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

  // Poll connection status until connected, so Quick Actions update automatically
  useEffect(() => {
    if (stats?.activeSession) return;
    const intervalId = setInterval(refreshConnectionStatus, 3000);
    return () => clearInterval(intervalId);
  }, [stats?.activeSession]);

  // Also refresh when the window regains focus (useful after returning from QR scan)
  useEffect(() => {
    const handleFocus = () => {
      refreshConnectionStatus();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
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

  const handleViewContacts = () => {
    router.push('/contacts');
  };



  if (loading) {
    return (
      <MainContent title="Dashboard" subtitle="Welcome to WhatsApp Status Handler">
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      </MainContent>
    );
  }

  return (
    <MainContent title="Dashboard" subtitle="Welcome to WhatsApp Status Handler">
      <div className="space-y-8">
        {/* Quick Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      

          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover-lift animate-fade-in-up" style={{animationDelay: '0.1s'}}>
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
                        
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover-lift animate-fade-in-up" style={{animationDelay: '0.2s'}}>
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
                        
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover-lift animate-fade-in-up" style={{animationDelay: '0.3s'}}>
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

        {/* Quick Actions */}
        <div className="animate-slide-in-left">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Quick Actions</h2>
            <p className="text-gray-600">Get started with these common tasks</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

            {/* Contacts Action */}
            <div 
              onClick={handleViewContacts}
              className="group cursor-pointer relative overflow-hidden rounded-2xl p-8 bg-gradient-to-br from-teal-500 to-cyan-600 text-white transition-all duration-300 hover:scale-105 hover:shadow-xl"
            >
              <div className="relative z-10">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-white/30 transition-colors">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-2">Manage Contacts</h3>
                <p className="text-white/80 text-sm">
                  View contacts and groups
                </p>
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>

        {/* Getting Started */}
        {!stats?.activeSession && (
          <div className="animate-fade-in-up" style={{animationDelay: '0.4s'}}>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 hover-lift">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Getting Started</h2>
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
    </MainContent>
  );
}
