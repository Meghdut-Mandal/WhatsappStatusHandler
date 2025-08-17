'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Loader, 
  Pause, 
  Play, 
  X, 
  Upload,
  AlertTriangle,
  RefreshCw,
  FileIcon,
  Image,
  Video,
  Music,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { FileWithPreview } from './FileUpload';

export interface UploadProgressItem {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  uploaded: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'cancelled' | 'paused';
  error?: string;
  startTime: number;
  endTime?: number;
  speed?: number;
  estimatedTimeRemaining?: number;
}

interface UploadProgressProps {
  uploads: UploadProgressItem[];
  onCancel?: (uploadId: string) => void;
  onRetry?: (uploadId: string) => void;
  onPause?: (uploadId: string) => void;
  onResume?: (uploadId: string) => void;
  onClearCompleted?: () => void;
  onClearAll?: () => void;
  className?: string;
  showStats?: boolean;
  compact?: boolean;
}

export function UploadProgress({ 
  uploads,
  onCancel,
  onRetry,
  onPause,
  onResume,
  onClearCompleted,
  onClearAll,
  className,
  showStats = true,
  compact = false
}: UploadProgressProps) {
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name' | 'status'>('newest');

  // Calculate statistics
  const stats = {
    total: uploads.length,
    pending: uploads.filter(u => u.status === 'pending').length,
    uploading: uploads.filter(u => u.status === 'uploading').length,
    completed: uploads.filter(u => u.status === 'completed').length,
    error: uploads.filter(u => u.status === 'error').length,
    cancelled: uploads.filter(u => u.status === 'cancelled').length,
    paused: uploads.filter(u => u.status === 'paused').length,
    totalSize: uploads.reduce((sum, u) => sum + u.size, 0),
    uploadedSize: uploads.reduce((sum, u) => sum + u.uploaded, 0),
  };

  const overallProgress = stats.totalSize > 0 ? (stats.uploadedSize / stats.totalSize) * 100 : 0;

  // Sort uploads
  const sortedUploads = [...uploads].sort((a, b) => {
    switch (sortOrder) {
      case 'newest':
        return b.startTime - a.startTime;
      case 'oldest':
        return a.startTime - b.startTime;
      case 'name':
        return a.originalName.localeCompare(b.originalName);
      case 'status':
        return a.status.localeCompare(b.status);
      default:
        return 0;
    }
  });

  if (uploads.length === 0) {
    return null;
  }

  return (
    <div className={cn('bg-white rounded-lg shadow-sm border border-gray-200', className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900 ">
              Upload Progress
            </h3>
            {stats.uploading > 0 && (
              <div className="flex items-center gap-2">
                <Loader className="w-4 h-4 animate-spin text-blue-600" />
                <span className="text-sm text-gray-600 ">
                  {stats.uploading} uploading
                </span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
              className="text-sm border border-gray-300  rounded px-2 py-1 bg-white "
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name</option>
              <option value="status">Status</option>
            </select>

            {/* Clear buttons */}
            {onClearCompleted && stats.completed > 0 && (
              <button
                onClick={onClearCompleted}
                className="text-sm text-gray-600 hover:text-gray-800  "
              >
                Clear completed
              </button>
            )}
            {onClearAll && (
              <button
                onClick={onClearAll}
                className="text-sm text-red-600 hover:text-red-800  "
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Overall progress */}
        {showStats && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-gray-600  mb-2">
              <span>Overall Progress</span>
              <span>{Math.round(overallProgress)}%</span>
            </div>
            <div className="w-full bg-gray-200  rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500  mt-2">
              <span>{formatFileSize(stats.uploadedSize)} / {formatFileSize(stats.totalSize)}</span>
              <span>{stats.completed} / {stats.total} files</span>
            </div>
          </div>
        )}

        {/* Stats summary */}
        {showStats && !compact && (
          <div className="flex gap-4 mt-4 text-xs">
            {stats.pending > 0 && (
              <span className="text-gray-600 ">
                {stats.pending} pending
              </span>
            )}
            {stats.uploading > 0 && (
              <span className="text-blue-600">
                {stats.uploading} uploading
              </span>
            )}
            {stats.completed > 0 && (
              <span className="text-green-600">
                {stats.completed} completed
              </span>
            )}
            {stats.error > 0 && (
              <span className="text-red-600">
                {stats.error} failed
              </span>
            )}
            {stats.cancelled > 0 && (
              <span className="text-gray-600 ">
                {stats.cancelled} cancelled
              </span>
            )}
            {stats.paused > 0 && (
              <span className="text-yellow-600">
                {stats.paused} paused
              </span>
            )}
          </div>
        )}
      </div>

      {/* Upload list */}
      <div className="max-h-96 overflow-y-auto">
        {sortedUploads.map((upload) => (
          <UploadItem
            key={upload.id}
            upload={upload}
            onCancel={onCancel}
            onRetry={onRetry}
            onPause={onPause}
            onResume={onResume}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

interface UploadItemProps {
  upload: UploadProgressItem;
  onCancel?: (uploadId: string) => void;
  onRetry?: (uploadId: string) => void;
  onPause?: (uploadId: string) => void;
  onResume?: (uploadId: string) => void;
  compact?: boolean;
}

function UploadItem({ 
  upload, 
  onCancel, 
  onRetry, 
  onPause, 
  onResume,
  compact = false 
}: UploadItemProps) {
  const progress = upload.size > 0 ? (upload.uploaded / upload.size) * 100 : 0;

  const getStatusIcon = () => {
    switch (upload.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'uploading':
        return <Loader className="w-5 h-5 animate-spin text-blue-600" />;
      case 'paused':
        return <Pause className="w-5 h-5 text-yellow-600" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-gray-400" />;
      default:
        return <Upload className="w-5 h-5 text-gray-400" />;
    }
  };

  const getFileIcon = () => {
    if (upload.mimetype.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (upload.mimetype.startsWith('video/')) return <Video className="w-4 h-4" />;
    if (upload.mimetype.startsWith('audio/')) return <Music className="w-4 h-4" />;
    if (upload.mimetype === 'application/pdf') return <FileText className="w-4 h-4" />;
    return <FileIcon className="w-4 h-4" />;
  };

  const getStatusColor = () => {
    switch (upload.status) {
      case 'completed': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'uploading': return 'text-blue-600';
      case 'paused': return 'text-yellow-600';
      case 'cancelled': return 'text-gray-400';
      default: return 'text-gray-600';
    }
  };

  const formatSpeed = (speed: number) => {
    return `${formatFileSize(speed)}/s`;
  };

  const formatTimeRemaining = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${Math.round(seconds % 60)}s`;
  };

  return (
    <div className="p-4 border-b border-gray-200  last:border-b-0">
      <div className="flex items-start gap-3">
        {/* File icon */}
        <div className="flex-shrink-0 mt-1">
          {getFileIcon()}
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-gray-900  truncate">
              {upload.originalName}
            </p>
            {getStatusIcon()}
            <span className={cn('text-xs font-medium capitalize', getStatusColor())}>
              {upload.status}
            </span>
          </div>

          {!compact && (
            <div className="text-xs text-gray-500  mb-2">
              <span>{formatFileSize(upload.size)} • {upload.mimetype}</span>
              {upload.speed && upload.status === 'uploading' && (
                <span> • {formatSpeed(upload.speed)}</span>
              )}
              {upload.estimatedTimeRemaining && upload.status === 'uploading' && (
                <span> • {formatTimeRemaining(upload.estimatedTimeRemaining)} remaining</span>
              )}
            </div>
          )}

          {/* Progress bar */}
          {(upload.status === 'uploading' || upload.status === 'paused') && (
            <div className="mb-2">
              <div className="flex items-center justify-between text-xs text-gray-600  mb-1">
                <span>{formatFileSize(upload.uploaded)} / {formatFileSize(upload.size)}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-200  rounded-full h-2">
                <div
                  className={cn(
                    'h-2 rounded-full transition-all duration-300',
                    upload.status === 'uploading' ? 'bg-blue-600' : 'bg-yellow-600'
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {upload.status === 'error' && upload.error && (
            <div className="flex items-start gap-2 mt-2 p-2 bg-red-50  border border-red-200  rounded text-sm">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span className="text-red-700 ">{upload.error}</span>
            </div>
          )}

          {/* Completion info */}
          {upload.status === 'completed' && upload.endTime && (
            <div className="text-xs text-green-600 mt-1">
              Completed in {Math.round((upload.endTime - upload.startTime) / 1000)}s
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {upload.status === 'uploading' && onPause && (
            <button
              onClick={() => onPause(upload.id)}
              className="p-1 text-gray-400 hover:text-yellow-600 transition-colors"
              title="Pause upload"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}
          
          {upload.status === 'paused' && onResume && (
            <button
              onClick={() => onResume(upload.id)}
              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
              title="Resume upload"
            >
              <Play className="w-4 h-4" />
            </button>
          )}

          {upload.status === 'error' && onRetry && (
            <button
              onClick={() => onRetry(upload.id)}
              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
              title="Retry upload"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {(upload.status === 'uploading' || upload.status === 'paused' || upload.status === 'pending') && onCancel && (
            <button
              onClick={() => onCancel(upload.id)}
              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
              title="Cancel upload"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
