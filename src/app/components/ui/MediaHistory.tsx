'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MediaPreview } from './MediaPreview';
import { Button } from './Button';
import { FileWithPreview } from './FileUpload';
import { 
  Grid, 
  List, 
  Search, 
  Download,
  Trash2,
  RefreshCw,
  Send,
  Eye,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface MediaHistoryFile {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  sizeBytes: number;
  sha256?: string;
  createdAt: string;
  duration?: number;
  width?: number;
  height?: number;
  isTemporary: boolean;
  previewUrl?: string;
  downloadUrl: string;
}

interface MediaHistoryProps {
  onFileSelect?: (files: MediaHistoryFile[]) => void;
  onFileResend?: (file: MediaHistoryFile) => void;
  onFileDelete?: (fileIds: string[]) => void;
  className?: string;
  maxHeight?: string;
}

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'image' | 'video' | 'audio' | 'document';
type SortType = 'createdAt' | 'originalName' | 'sizeBytes' | 'mimetype';

export function MediaHistory({ 
  onFileSelect, 
  onFileResend, 
  onFileDelete,
  className,
  maxHeight = '400px'
}: MediaHistoryProps) {
  const [files, setFiles] = useState<MediaHistoryFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 50;

  // Store the latest filter/sort values in refs to avoid dependency cycles
  const latestFiltersRef = useRef({ sortBy, sortOrder, searchQuery, filter });
  latestFiltersRef.current = { sortBy, sortOrder, searchQuery, filter };

  // Stable function that doesn't depend on changing values
  const fetchMediaHistory = useCallback(async (reset = false, customOffset?: number) => {
    try {
      setLoading(true);
      setError(null);

      const { sortBy: currentSortBy, sortOrder: currentSortOrder, searchQuery: currentSearchQuery, filter: currentFilter } = latestFiltersRef.current;
      const currentOffset = reset ? 0 : customOffset ?? 0;

      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: currentOffset.toString(),
        sortBy: currentSortBy,
        sortOrder: currentSortOrder,
      });

      if (currentSearchQuery) params.set('search', currentSearchQuery);
      if (currentFilter !== 'all') params.set('mimeType', currentFilter);

      const response = await fetch(`/api/upload/history?${params}`);
      const result = await response.json();

      if (result.success) {
        if (reset) {
          setFiles(result.files);
          setOffset(result.files.length);
        } else {
          setFiles(prev => [...prev, ...result.files]);
          setOffset(prev => prev + result.files.length);
        }
        setHasMore(result.pagination.hasMore);
      } else {
        setError(result.error || 'Failed to load media history');
      }
    } catch (err) {
      console.error('Fetch media history error:', err);
      setError('Failed to load media history');
    } finally {
      setLoading(false);
    }
  }, []); // No dependencies - stable function

  // Initial load and reload on filter/search changes
  useEffect(() => {
    setOffset(0);
    fetchMediaHistory(true);
  }, [sortBy, sortOrder, searchQuery, filter, fetchMediaHistory]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setOffset(0);
    setSelectedFiles(new Set());
    fetchMediaHistory(true);
  }, [fetchMediaHistory]);

  // Handle load more
  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchMediaHistory(false, offset);
    }
  }, [loading, hasMore, fetchMediaHistory, offset]);

  // Handle file selection toggle
  const handleFileSelectionToggle = useCallback((fileId: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.id)));
    }
  }, [selectedFiles.size, files]);

  // Handle bulk delete
  const handleBulkDelete = useCallback(async () => {
    if (selectedFiles.size === 0) return;

    try {
      const fileIds = Array.from(selectedFiles);
      
      if (onFileDelete) {
        onFileDelete(fileIds);
      }

      // Remove deleted files from local state
      setFiles(prev => prev.filter(f => !selectedFiles.has(f.id)));
      setSelectedFiles(new Set());

      // Also call the API to delete from database
      const params = new URLSearchParams({
        fileIds: fileIds.join(',')
      });
      
      await fetch(`/api/upload/history?${params}`, {
        method: 'DELETE'
      });
      
    } catch (error) {
      console.error('Delete files error:', error);
      setError('Failed to delete files');
    }
  }, [selectedFiles, onFileDelete]);

  // Handle individual file actions
  const handleFileView = useCallback((file: MediaHistoryFile) => {
    if (file.previewUrl) {
      window.open(file.previewUrl, '_blank');
    }
  }, []);

  const handleFileDownload = useCallback((file: MediaHistoryFile) => {
    const link = document.createElement('a');
    link.href = file.downloadUrl;
    link.download = file.originalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleFileResend = useCallback((file: MediaHistoryFile) => {
    if (onFileResend) {
      onFileResend(file);
    }
  }, [onFileResend]);

  // Convert file for MediaPreview component
  const convertToFileWithPreview = (file: MediaHistoryFile): Partial<FileWithPreview> => ({
    id: file.id,
    name: file.originalName,
    size: file.sizeBytes,
    type: file.mimetype,
    lastModified: new Date(file.createdAt).getTime(),
    uploadStatus: 'completed' as const,
    mediaMetaId: file.id,
    preview: file.previewUrl,
    // Add minimal File-like properties
    webkitRelativePath: '',
    arrayBuffer: async () => new ArrayBuffer(0),
    bytes: async () => new Uint8Array(0),
    slice: () => new Blob(),
    stream: () => new ReadableStream(),
    text: async () => '',
  });

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const sizeIndex = Math.min(i, sizes.length - 1);
    const formattedSize = parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(2));
    return `${formattedSize} ${sizes[sizeIndex]}`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (error) {
    return (
      <div className={cn('bg-white rounded-lg shadow-sm border border-gray-200 p-6', className)}>
        <div className="text-center">
          <div className="text-red-600 mb-2">Error: {error}</div>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-white rounded-lg shadow-sm border border-gray-200', className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Media History ({files.length})
            </h3>
            
            {selectedFiles.size > 0 && (
              <span className="text-sm text-blue-600">
                {selectedFiles.size} selected
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>

            {/* View toggle */}
            <div className="flex border border-gray-300 rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'p-2 rounded-l-lg',
                  viewMode === 'grid' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-2 rounded-r-lg border-l border-gray-300',
                  viewMode === 'list' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters and actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Filter */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterType)}
              className="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
            >
              <option value="all">All files</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="audio">Audio</option>
              <option value="document">Documents</option>
            </select>

            {/* Sort */}
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split(':');
                setSortBy(field as SortType);
                setSortOrder(order as 'asc' | 'desc');
              }}
              className="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
            >
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="originalName:asc">Name A-Z</option>
              <option value="originalName:desc">Name Z-A</option>
              <option value="sizeBytes:desc">Largest first</option>
              <option value="sizeBytes:asc">Smallest first</option>
            </select>

            {/* Select all */}
            <button
              onClick={handleSelectAll}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {selectedFiles.size === files.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          {/* Actions */}
          {selectedFiles.size > 0 && (
            <div className="flex items-center gap-2">
              {onFileSelect && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const selectedFilesList = files.filter(f => selectedFiles.has(f.id));
                    onFileSelect(selectedFilesList);
                  }}
                  className="flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Use Selected
                </Button>
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDelete}
                className="flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* File List */}
      <div className="p-4" style={{ maxHeight, overflowY: 'auto' }}>
        {loading && files.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mr-2" />
            <span className="text-gray-500">Loading media history...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchQuery ? 'No files match your search.' : 'No files uploaded yet.'}
          </div>
        ) : (
          <>
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className={cn(
                      'relative group cursor-pointer rounded-lg border-2 transition-all',
                      selectedFiles.has(file.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-transparent hover:border-gray-300'
                    )}
                  >
                    <div onClick={() => handleFileSelectionToggle(file.id)}>
                      <MediaPreview 
                        file={convertToFileWithPreview(file) as FileWithPreview} 
                        className="w-full" 
                      />
                      
                      {/* Selection indicator */}
                      <div className={cn(
                        'absolute top-2 left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center',
                        selectedFiles.has(file.id)
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300 bg-white group-hover:border-gray-400'
                      )}>
                        {selectedFiles.has(file.id) && (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>

                      {/* File info */}
                      <div className="p-2">
                        <p className="text-xs text-gray-600 truncate">
                          {file.originalName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(file.sizeBytes)}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatDate(file.createdAt)}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex gap-1">
                        {file.previewUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFileView(file);
                            }}
                            className="p-1 bg-white rounded-full shadow-sm hover:bg-gray-100"
                            title="View"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        )}
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFileDownload(file);
                          }}
                          className="p-1 bg-white rounded-full shadow-sm hover:bg-gray-100"
                          title="Download"
                        >
                          <Download className="w-3 h-3" />
                        </button>

                        {onFileResend && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFileResend(file);
                            }}
                            className="p-1 bg-white rounded-full shadow-sm hover:bg-gray-100"
                            title="Re-send"
                          >
                            <Send className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className={cn(
                      'flex items-center p-3 rounded-lg border cursor-pointer transition-all',
                      selectedFiles.has(file.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                    onClick={() => handleFileSelectionToggle(file.id)}
                  >
                    {/* Selection checkbox */}
                    <div className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center mr-3',
                      selectedFiles.has(file.id)
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-gray-300'
                    )}>
                      {selectedFiles.has(file.id) && (
                        <div className="w-2 h-2 bg-white rounded-full" />
                      )}
                    </div>

                    {/* Preview */}
                    <div className="w-12 h-12 mr-3 flex-shrink-0">
                      <MediaPreview 
                        file={convertToFileWithPreview(file) as FileWithPreview} 
                        className="w-12 h-12" 
                        showControls={false} 
                      />
                    </div>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.originalName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.sizeBytes)} • {file.mimetype}
                      </p>
                      <p className="text-xs text-gray-400">
                        <Calendar className="w-3 h-3 inline mr-1" />
                        {formatDate(file.createdAt)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 ml-4">
                      {file.previewUrl && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFileView(file);
                          }}
                          className="p-2 text-gray-400 hover:text-gray-600"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFileDownload(file);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>

                      {onFileResend && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFileResend(file);
                          }}
                          className="p-2 text-gray-400 hover:text-gray-600"
                          title="Re-send"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Load more */}
            {hasMore && (
              <div className="text-center mt-4">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="flex items-center gap-2"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    'Load More'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
