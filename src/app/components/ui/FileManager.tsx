'use client';

import { useState, useCallback } from 'react';
import { FileUpload, FileWithPreview } from './FileUpload';
import { MediaPreview } from './MediaPreview';
import { UploadProgress, UploadProgressItem } from './UploadProgress';
import { Button } from './Button';
import { 
  Grid, 
  List, 
  Search, 
  Send,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface FileManagerProps {
  onFileSend?: (files: FileWithPreview[], targetType: 'status' | 'contact' | 'group', targetId?: string) => void;
  className?: string;
}

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'images' | 'videos' | 'audio' | 'documents';
type SortType = 'name' | 'size' | 'type' | 'date';

export function FileManager({ onFileSend, className }: FileManagerProps) {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [uploadProgress, setUploadProgress] = useState<UploadProgressItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('date');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Handle file selection
  const handleFilesSelected = useCallback((newFiles: FileWithPreview[]) => {
    setFiles(newFiles);
  }, []);

  // Handle file removal
  const handleFileRemove = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
    setSelectedFiles(prev => {
      const next = new Set(prev);
      next.delete(fileId);
      return next;
    });
  }, []);

  // Handle upload start
  const handleUploadStart = useCallback(async (filesToUpload: FileWithPreview[]) => {
    setIsUploading(true);
    
    try {
      // Create FormData for upload
      const formData = new FormData();
      filesToUpload.forEach((file) => {
        formData.append('files', file);
      });

      // Initialize upload progress items
      const progressItems: UploadProgressItem[] = filesToUpload.map(file => ({
        id: file.id,
        filename: file.name,
        originalName: file.name,
        mimetype: file.type,
        size: file.size,
        uploaded: 0,
        status: 'uploading' as const,
        startTime: Date.now(),
      }));
      
      setUploadProgress(progressItems);

      // Start upload with progress tracking
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (result.success) {
        // Update progress items as completed
        setUploadProgress(prev => 
          prev.map(item => ({
            ...item,
            status: 'completed' as const,
            uploaded: item.size,
            endTime: Date.now(),
          }))
        );

        // Update files with upload results
        setFiles(prev => 
          prev.map(file => {
            const uploadResult = result.uploads.find((u: any) => u.originalName === file.name);
            if (uploadResult) {
              return {
                ...file,
                uploadStatus: 'completed' as const,
                mediaMetaId: uploadResult.mediaMetaId,
              };
            }
            return file;
          })
        );
      } else {
        // Handle upload errors
        setUploadProgress(prev => 
          prev.map(item => ({
            ...item,
            status: 'error' as const,
            error: result.error || 'Upload failed',
            endTime: Date.now(),
          }))
        );
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadProgress(prev => 
        prev.map(item => ({
          ...item,
          status: 'error' as const,
          error: 'Network error',
          endTime: Date.now(),
        }))
      );
    } finally {
      setIsUploading(false);
    }
  }, []);

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
    const filteredFiles = getFilteredAndSortedFiles();
    if (selectedFiles.size === filteredFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredFiles.map(f => f.id)));
    }
  }, [selectedFiles.size, files, filter, searchQuery, sortBy]);

  // Handle bulk delete
  const handleBulkDelete = useCallback(() => {
    setFiles(prev => prev.filter(f => !selectedFiles.has(f.id)));
    setSelectedFiles(new Set());
  }, [selectedFiles]);

  // Handle send selected
  const handleSendSelected = useCallback((targetType: 'status' | 'contact' | 'group', targetId?: string) => {
    const selectedFilesList = files.filter(f => selectedFiles.has(f.id));
    if (selectedFilesList.length > 0 && onFileSend) {
      onFileSend(selectedFilesList, targetType, targetId);
    }
  }, [files, selectedFiles, onFileSend]);

  // Filter and sort files
  const getFilteredAndSortedFiles = useCallback(() => {
    let filtered = files;

    // Apply filter
    if (filter !== 'all') {
      filtered = filtered.filter(file => {
        switch (filter) {
          case 'images': return file.type.startsWith('image/');
          case 'videos': return file.type.startsWith('video/');
          case 'audio': return file.type.startsWith('audio/');
          case 'documents': return file.type === 'application/pdf' || file.type.startsWith('text/');
          default: return true;
        }
      });
    }

    // Apply search
    if (searchQuery) {
      filtered = filtered.filter(file => 
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'size':
          return b.size - a.size;
        case 'type':
          return a.type.localeCompare(b.type);
        case 'date':
        default:
          return b.lastModified - a.lastModified;
      }
    });

    return filtered;
  }, [files, filter, searchQuery, sortBy]);

  const filteredFiles = getFilteredAndSortedFiles();

  return (
    <div className={cn('space-y-6', className)}>
      {/* Upload Area */}
      <FileUpload
        onFilesSelected={handleFilesSelected}
        onFileRemove={handleFileRemove}
        onUploadStart={handleUploadStart}
        disabled={isUploading}
      />

      {/* Upload Progress */}
      {uploadProgress.length > 0 && (
        <UploadProgress
          uploads={uploadProgress}
          onCancel={(id) => {
            // Handle cancel
            setUploadProgress(prev => 
              prev.map(item => 
                item.id === id 
                  ? { ...item, status: 'cancelled' as const, endTime: Date.now() }
                  : item
              )
            );
          }}
          onRetry={(id) => {
            // Handle retry
            const item = uploadProgress.find(u => u.id === id);
            if (item) {
              setUploadProgress(prev => 
                prev.map(p => 
                  p.id === id 
                    ? { ...p, status: 'uploading' as const, uploaded: 0, startTime: Date.now(), endTime: undefined }
                    : p
                )
              );
            }
          }}
          onClearCompleted={() => {
            setUploadProgress(prev => prev.filter(u => u.status !== 'completed'));
          }}
        />
      )}

      {/* File Management Interface */}
      {files.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Files ({filteredFiles.length})
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
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-4">
                {/* Filter */}
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as FilterType)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
                >
                  <option value="all">All files</option>
                  <option value="images">Images</option>
                  <option value="videos">Videos</option>
                  <option value="audio">Audio</option>
                  <option value="documents">Documents</option>
                </select>

                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortType)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
                >
                  <option value="date">Sort by date</option>
                  <option value="name">Sort by name</option>
                  <option value="size">Sort by size</option>
                  <option value="type">Sort by type</option>
                </select>

                {/* Select all */}
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {selectedFiles.size === filteredFiles.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              {/* Actions */}
              {selectedFiles.size > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSendSelected('status')}
                    className="flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Send to Status
                  </Button>
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

          {/* File Grid/List */}
          <div className="p-4">
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {filteredFiles.map((file) => (
                  <div
                    key={file.id}
                    className={cn(
                      'relative group cursor-pointer rounded-lg border-2 transition-all',
                      selectedFiles.has(file.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-transparent hover:border-gray-300'
                    )}
                    onClick={() => handleFileSelectionToggle(file.id)}
                  >
                    <MediaPreview file={file} className="w-full" />
                    
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
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFiles.map((file) => (
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
                      <MediaPreview file={file} className="w-12 h-12" showControls={false} />
                    </div>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)} • {file.type}
                      </p>
                    </div>

                    {/* Upload status */}
                    {file.uploadStatus && (
                      <div className="text-xs text-gray-500 mr-3">
                        {file.uploadStatus}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {filteredFiles.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                {searchQuery ? 'No files match your search.' : 'No files to display.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  // Handle undefined, null, NaN, or negative values
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  // Ensure i is within bounds
  const sizeIndex = Math.min(i, sizes.length - 1);
  const formattedSize = parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(2));
  
  return `${formattedSize} ${sizes[sizeIndex]}`;
}
