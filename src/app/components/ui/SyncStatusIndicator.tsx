'use client';

import React from 'react';

export interface SyncStatus {
  inProgress: boolean;
  type?: 'full' | 'incremental' | 'contacts' | 'groups';
  progress?: {
    current: number;
    total: number;
    stage?: string;
  };
  message?: string;
  error?: string;
  lastSync?: string;
  retryCount?: number;
  maxRetries?: number;
}

interface SyncStatusIndicatorProps {
  status: SyncStatus;
  onRetry?: () => void;
  onCancel?: () => void;
  compact?: boolean;
  className?: string;
}

export function SyncStatusIndicator({ 
  status, 
  onRetry, 
  onCancel, 
  compact = false,
  className = '' 
}: SyncStatusIndicatorProps) {
  const formatLastSync = (lastSync: string) => {
    const date = new Date(lastSync);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const getProgressPercentage = () => {
    if (!status.progress) return 0;
    return Math.round((status.progress.current / status.progress.total) * 100);
  };

  const getSyncTypeLabel = () => {
    switch (status.type) {
      case 'full': return 'Full Sync';
      case 'incremental': return 'Incremental Sync';
      case 'contacts': return 'Contacts Sync';
      case 'groups': return 'Groups Sync';
      default: return 'Sync';
    }
  };

  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        {status.inProgress ? (
          <>
            <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-sm text-blue-600">
              {status.message || 'Syncing...'}
            </span>
            {status.progress && (
              <span className="text-xs text-gray-500">
                ({status.progress.current}/{status.progress.total})
              </span>
            )}
          </>
        ) : status.error ? (
          <>
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-red-600">Sync failed</span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-xs text-red-600 hover:text-red-800 underline"
              >
                Retry
              </button>
            )}
          </>
        ) : (
          <>
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-gray-600">
              {status.lastSync ? `Synced ${formatLastSync(status.lastSync)}` : 'Ready'}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-white border rounded-lg p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {status.inProgress ? (
            <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : status.error ? (
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          <h3 className="font-medium text-gray-900">
            {status.inProgress ? getSyncTypeLabel() : status.error ? 'Sync Failed' : 'Sync Status'}
          </h3>
        </div>
        
        {status.inProgress && onCancel && (
          <button
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {status.inProgress && status.progress && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>{status.progress.stage || 'Processing'}</span>
            <span>{getProgressPercentage()}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${getProgressPercentage()}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
            <span>{status.progress.current} of {status.progress.total} items</span>
          </div>
        </div>
      )}

      {/* Status Message */}
      <div className="text-sm">
        {status.inProgress ? (
          <p className="text-blue-600">
            {status.message || 'Synchronizing data...'}
          </p>
        ) : status.error ? (
          <div className="space-y-2">
            <p className="text-red-600">{status.error}</p>
            {status.retryCount !== undefined && status.maxRetries !== undefined && (
              <p className="text-gray-500">
                Retry attempt {status.retryCount} of {status.maxRetries}
              </p>
            )}
            <div className="flex space-x-2">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-sm text-red-600 hover:text-red-800 underline"
                >
                  Retry Now
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-gray-600">
            {status.lastSync 
              ? `Last synchronized ${formatLastSync(status.lastSync)}`
              : 'Ready to sync'
            }
          </p>
        )}
      </div>
    </div>
  );
}