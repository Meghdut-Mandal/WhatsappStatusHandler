'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { LoadingSpinner } from './Loading';

type ConnectionStatusType = 'disconnected' | 'connecting' | 'connected' | 'qr_required' | 'error';

interface ConnectionStatusProps {
  className?: string;
  showDetails?: boolean;
  autoUpdate?: boolean;
  updateInterval?: number;
}

interface StatusData {
  status: ConnectionStatusType;
  session?: {
    id: string;
    deviceName: string;
    isActive: boolean;
  };
  whatsappUser?: {
    name: string;
    id: string;
  };
  timestamp?: string;
}

const statusConfig = {
  disconnected: {
    color: 'bg-gray-500',
    textColor: 'text-gray-700',
    label: 'Disconnected',
    icon: '○',
  },
  connecting: {
    color: 'bg-yellow-500',
    textColor: 'text-yellow-700',
    label: 'Connecting...',
    icon: '●',
  },
  connected: {
    color: 'bg-green-500',
    textColor: 'text-green-700',
    label: 'Connected',
    icon: '●',
  },
  qr_required: {
    color: 'bg-blue-500',
    textColor: 'text-blue-700',
    label: 'QR Scan Required',
    icon: '●',
  },
  error: {
    color: 'bg-red-500',
    textColor: 'text-red-700',
    label: 'Error',
    icon: '●',
  },
};

export function ConnectionStatus({ 
  className, 
  showDetails = false, 
  autoUpdate = true,
  updateInterval = 5000 
}: ConnectionStatusProps) {
  const [statusData, setStatusData] = useState<StatusData>({ status: 'disconnected' });
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/auth/status');
      const data = await response.json();
      
      if (data.success) {
        setStatusData({
          status: data.status,
          session: data.session,
          whatsappUser: data.whatsappUser,
          timestamp: data.timestamp,
        });
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
      setStatusData({ status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchStatus();
  }, []);

  useEffect(() => {
    if (autoUpdate) {
      const interval = setInterval(fetchStatus, updateInterval);
      return () => clearInterval(interval);
    }
  }, [autoUpdate, updateInterval]);

  const config = statusConfig[statusData.status];

  return (
    <div className={cn('flex items-center space-x-3', className)}>
      <div className="flex items-center space-x-2">
        <div className={cn('w-3 h-3 rounded-full', config.color)} />
        <span className={cn('text-sm font-medium', config.textColor)}>
          {config.label}
        </span>
        {loading && <LoadingSpinner size="sm" />}
      </div>
      
      {showDetails && statusData.status === 'connected' && (
        <div className="text-xs text-gray-600">
          {statusData.whatsappUser?.name && (
            <span>as {statusData.whatsappUser.name}</span>
          )}
          {statusData.session?.deviceName && (
            <span className="ml-2">({statusData.session.deviceName})</span>
          )}
        </div>
      )}
    </div>
  );
}

interface StatusIndicatorProps {
  status: ConnectionStatusType;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusIndicator({ status, className, size = 'md' }: StatusIndicatorProps) {
  const config = statusConfig[status];
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  return (
    <div 
      className={cn(
        'rounded-full',
        config.color,
        sizeClasses[size],
        status === 'connecting' && 'animate-pulse',
        className
      )}
      title={config.label}
    />
  );
}
