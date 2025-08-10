'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { QRDisplay } from '../components/ui/QRDisplay';
import { ConnectionStatus } from '../components/ui/ConnectionStatus';
import { Button } from '../components/ui/Button';
import { ContentSection } from '../components/layout/MainContent';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

export default function AuthPage() {
  const router = useRouter();
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Check if already connected and redirect
    const checkConnection = async () => {
      try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        
        if (data.success && data.status === 'connected') {
          setIsConnected(true);
          setTimeout(() => {
            router.push('/');
          }, 2000);
        } else {
          setConnectionStatus(data.status || 'disconnected');
        }
      } catch (error) {
        console.error('Failed to check connection status:', error);
      }
    };

    checkConnection();
    
    // Poll for connection status
    const interval = setInterval(checkConnection, 3000);
    return () => clearInterval(interval);
  }, [router]);

  const handleRefreshQR = async () => {
    try {
      const response = await fetch('/api/auth/qr', {
        method: 'POST',
      });
      const data = await response.json();
      
      if (data.success) {
        setConnectionStatus(data.status);
      }
    } catch (error) {
      console.error('Failed to refresh QR code:', error);
    }
  };

  if (isConnected) {
    return (
      <div className="text-center">
        <ContentSection>
          <div className="flex flex-col items-center space-y-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-gray-900">
                Connected Successfully!
              </h1>
                          <p className="text-gray-600">
              You&apos;re now connected to WhatsApp. Redirecting to dashboard...
            </p>
            </div>
            <Button onClick={() => router.push('/')}>
              Go to Dashboard
            </Button>
          </div>
        </ContentSection>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Connect to WhatsApp
          </h1>
          <p className="text-gray-600">
            Scan the QR code with your WhatsApp mobile app to get started
          </p>
        </div>

        <ContentSection>
          <div className="mb-4">
            <ConnectionStatus showDetails className="justify-center" />
          </div>
          
          <QRDisplay 
            onRefresh={handleRefreshQR}
            autoRefresh={true}
            refreshInterval={30000}
          />
        </ContentSection>

        <div className="text-center space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 mb-2">
              How to connect:
            </h3>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside text-left">
              <li>Open WhatsApp on your phone</li>
              <li>Go to Settings → Connected Devices</li>
              <li>Tap &quot;Connect a Device&quot;</li>
              <li>Scan the QR code above</li>
            </ol>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              onClick={handleRefreshQR}
              variant="outline"
              className="flex-1"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh QR Code
            </Button>
            
            <Button 
              onClick={() => router.push('/')}
              variant="ghost"
              className="flex-1"
            >
              Skip for Now
            </Button>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
