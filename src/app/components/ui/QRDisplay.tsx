'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from './Button';
import { Loading } from './Loading';
import { cn } from '@/lib/utils/cn';

interface QRDisplayProps {
  className?: string;
  onRefresh?: () => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function QRDisplay({ 
  className, 
  onRefresh, 
  autoRefresh = false, 
  refreshInterval = 30000 
}: QRDisplayProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [qrGeneratedAt, setQrGeneratedAt] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const fetchQR = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/auth/qr');
      const data = await response.json();
      
      if (data.success) {
        setQrCode(data.qrCode);
        setConnectionStatus(data.status);
        
        // Set QR generation time for expiry countdown
        if (data.qrCode && data.status === 'qr_required') {
          setQrGeneratedAt(new Date());
          setTimeRemaining(120); // 2 minutes typical QR expiry
        }
      } else {
        setError(data.error || 'Failed to generate QR code');
        setQrGeneratedAt(null);
        setTimeRemaining(null);
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('QR fetch error:', err);
      setQrGeneratedAt(null);
      setTimeRemaining(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    }
    fetchQR();
  };

  useEffect(() => {
    fetchQR();
  }, []);

  // Auto refresh when QR is required
  useEffect(() => {
    if (autoRefresh && connectionStatus === 'qr_required') {
      const interval = setInterval(fetchQR, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, connectionStatus]);

  // Countdown timer for QR expiry
  useEffect(() => {
    if (timeRemaining !== null && timeRemaining > 0 && connectionStatus === 'qr_required') {
      const countdown = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev === null || prev <= 1) {
            // Auto-refresh when QR expires
            fetchQR();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(countdown);
    }
  }, [timeRemaining, connectionStatus]);

  // Real-time connection status polling
  useEffect(() => {
    const statusInterval = setInterval(async () => {
      if (connectionStatus !== 'connected') {
        try {
          const response = await fetch('/api/auth/status');
          const data = await response.json();
          if (data.success && data.status !== connectionStatus) {
            setConnectionStatus(data.status);
            
            // If connected, clear QR and show success
            if (data.status === 'connected') {
              setQrCode(null);
              setQrGeneratedAt(null);
              setTimeRemaining(null);
            }
          }
        } catch (error) {
          console.error('Status check error:', error);
        }
      }
    }, 3000); // Check every 3 seconds

    return () => clearInterval(statusInterval);
  }, [connectionStatus]);

  if (loading && !qrCode) {
    return (
      <div className={cn('flex flex-col items-center p-6', className)}>
        <Loading size="lg" text="Generating QR Code..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex flex-col items-center p-6 space-y-4', className)}>
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.232 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">QR Code Error</h3>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <Button onClick={handleRefresh} variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'connected') {
    return (
      <div className={cn('flex flex-col items-center p-6 space-y-4', className)}>
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">✅ Connected to WhatsApp</h3>
          <p className="text-sm text-gray-600 mb-2">You&apos;re ready to send status updates!</p>
          <p className="text-xs text-green-600 font-medium">
            🤖 Connection message sent to your WhatsApp
          </p>
        </div>
      </div>
    );
  }

  if (!qrCode) {
    return (
      <div className={cn('flex flex-col items-center p-6', className)}>
        <p className="text-gray-600">No QR code available</p>
        <Button onClick={handleRefresh} className="mt-4" variant="outline">
          Generate QR Code
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-center p-6 space-y-4', className)}>
      <div className="text-center mb-4">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Scan QR Code</h3>
        <p className="text-sm text-gray-600">
          Open WhatsApp on your phone and scan this code to connect
        </p>
      </div>
      
      <div className="relative">
        <Image
          src={qrCode}
          alt="WhatsApp QR Code"
          width={256}
          height={256}
          className="border-2 border-gray-200 rounded-lg"
          priority
        />
        {loading && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded-lg">
            <Loading size="md" />
          </div>
        )}
      </div>
      
      <div className="text-center space-y-2">
        {timeRemaining !== null && timeRemaining > 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-gray-500">
              QR code expires in: <span className="font-mono font-medium text-orange-600">
                {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
              </span>
            </p>
            {timeRemaining <= 30 && (
              <p className="text-xs text-orange-600 font-medium animate-pulse">
                ⚠️ QR code expiring soon
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            QR code expires after a few minutes
          </p>
        )}
        
        <div className="flex gap-2 justify-center">
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh QR Code'}
          </Button>
          {autoRefresh && (
            <div className="flex items-center text-xs text-gray-500">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-1"></div>
              Auto-refresh enabled
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
