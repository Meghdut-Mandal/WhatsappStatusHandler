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

  const fetchQR = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/auth/qr');
      const data = await response.json();
      
      if (data.success) {
        setQrCode(data.qrCode);
        setConnectionStatus(data.status);
      } else {
        setError(data.error || 'Failed to generate QR code');
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('QR fetch error:', err);
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

  useEffect(() => {
    if (autoRefresh && connectionStatus === 'qr_required') {
      const interval = setInterval(fetchQR, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, connectionStatus]);

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
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Connected to WhatsApp</h3>
          <p className="text-sm text-gray-600">You&apos;re ready to send status updates!</p>
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
        <p className="text-xs text-gray-500">
          QR code expires after a few minutes
        </p>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          Refresh QR Code
        </Button>
      </div>
    </div>
  );
}
