'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MainContent } from '../../components/layout/MainContent';
import { QRDisplay } from '../../components/ui/QRDisplay';
import { ConnectionStatus } from '../../components/ui/ConnectionStatus';
import { Button } from '../../components/ui/Button';

export default function AuthPage() {
  const router = useRouter();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    try {
      const response = await fetch('/api/auth/status');
      const data = await response.json();
      if (data.success && data.status === 'connected') {
        setConnected(true);
      }
    } catch (error) {
      console.error('Failed to check connection status:', error);
    }
  };

  const generateQR = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/auth/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await response.json();
      
      if (data.success) {
        if (data.qrCode) {
          setQrCode(data.qrCode);
          
          // Poll for connection status
          const interval = setInterval(async () => {
            const statusResponse = await fetch('/api/auth/status');
            const statusData = await statusResponse.json();
            if (statusData.success && statusData.status === 'connected') {
              setConnected(true);
              clearInterval(interval);
              setTimeout(() => {
                router.push('/');
              }, 2000);
            }
          }, 3000);
          
          // Clear interval after 5 minutes
          setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
        } else if (data.timeout) {
          // Handle timeout case - show message but don't error completely
          setError('QR code is being generated. Please wait a moment and try refreshing.');
          
          // Auto-retry after a short delay
          setTimeout(async () => {
            setError(null);
            try {
              const retryResponse = await fetch('/api/auth/qr');
              const retryData = await retryResponse.json();
              if (retryData.success && retryData.qrCode) {
                setQrCode(retryData.qrCode);
                setError(null);
              }
            } catch (retryError) {
              console.warn('Auto-retry failed:', retryError);
            }
          }, 3000);
        } else {
          setError(data.message || 'QR code not ready yet. Please try again in a moment.');
        }
      } else {
        setError(data.error || 'Failed to generate QR code');
      }
    } catch (error) {
      console.error('QR generation error:', error);
      setError('Failed to generate QR code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/disconnect', {
        method: 'POST',
      });
      
      const data = await response.json();
      if (data.success) {
        setConnected(false);
        setQrCode(null);
      }
    } catch (error) {
      console.error('Disconnect error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainContent 
      title="WhatsApp Connection" 
      subtitle="Connect your WhatsApp account to send files"
    >
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {/* Connection Status */}
          <div className="mb-8">
            <ConnectionStatus showDetails />
          </div>

          {connected ? (
            <div className="text-center">
              <div className="mb-6">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Connected Successfully!</h3>
                <p className="text-gray-600 mb-6">
                  Your WhatsApp account is connected and ready to send files.
                </p>
              </div>

              <div className="space-y-4">
                <Button
                  onClick={() => router.push('/upload')}
                  className="w-full sm:w-auto"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload Files
                </Button>
                
                <Button
                  variant="outline"
                  onClick={disconnect}
                  disabled={loading}
                  className="w-full sm:w-auto ml-0 sm:ml-4"
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Connect to WhatsApp</h3>
                <p className="text-gray-600">
                  Scan the QR code with your WhatsApp mobile app to establish a connection.
                </p>
              </div>

              {qrCode ? (
                <div className="space-y-6">
                  <QRDisplay 
                    qrCode={qrCode}
                    onRegenerate={generateQR}
                    loading={loading}
                  />
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">How to connect:</h4>
                    <ol className="text-sm text-blue-800 space-y-1">
                      <li>1. Open WhatsApp on your phone</li>
                      <li>2. Go to Settings → Linked Devices</li>
                      <li>3. Tap on &ldquo;Link a Device&rdquo;</li>
                      <li>4. Scan this QR code</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-red-800">{error}</p>
                    </div>
                  )}
                  
                  <Button
                    onClick={generateQR}
                    disabled={loading}
                    size="lg"
                    className="w-full sm:w-auto"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                        Generate QR Code
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </MainContent>
  );
}
