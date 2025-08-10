'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './index';
import { Button } from './Button';
import { Input } from './Input';
import { Badge } from './Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';
import { Alert, AlertDescription } from './Alert';
import { 
  Upload, Download, Trash2, Search, Filter, Grid, List, 
  File, Image, Video, FileText, Music, Archive, Eye,
  CheckSquare, Square, MoreVertical, RefreshCw, Settings
} from 'lucide-react';

interface FileItem {
  id: string;
  name: string;
  type: 'image' | 'video' | 'document' | 'audio' | 'other';
  size: number;
  mimeType: string;
  uploadedAt: Date;
  lastModified: Date;
  status: 'uploading' | 'ready' | 'processing' | 'error';
  thumbnail?: string;
  metadata?: Record<string, any>;
  tags: string[];
  encrypted: boolean;
  expiresAt?: Date;
}

interface FileManagerProps {
  onFileSelect?: (files: FileItem[]) => void;
  onFileUpload?: (files: File[]) => void;
  onFileDelete?: (fileIds: string[]) => void;
  maxFileSize?: number;
  allowedTypes?: string[];
  showBatchActions?: boolean;
  showFileDetails?: boolean;
  enableSearch?: boolean;
  enableFilters?: boolean;
}

export default function AdvancedFileManager({
  onFileSelect,
  onFileUpload,
  onFileDelete,
  maxFileSize = 100 * 1024 * 1024, // 100MB
  allowedTypes = ['image/*', 'video/*', 'application/pdf'],
  showBatchActions = true,
  showFileDetails = true,
  enableSearch = true,
  enableFilters = true
}: FileManagerProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size' | 'type'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState(false);

  // Load files on component mount
  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/files');
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files.map((file: any) => ({
          ...file,
          uploadedAt: new Date(file.uploadedAt),
          lastModified: new Date(file.lastModified),
          expiresAt: file.expiresAt ? new Date(file.expiresAt) : undefined
        })));
      }
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter and sort files
  const filteredAndSortedFiles = React.useMemo(() => {
    let filtered = files;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(file =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(file => file.type === filterType);
    }

    // Sort files
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'date':
          comparison = a.uploadedAt.getTime() - b.uploadedAt.getTime();
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [files, searchQuery, filterType, sortBy, sortOrder]);

  // Handle file upload
  const handleFileUpload = useCallback(async (uploadFiles: File[]) => {
    const validFiles = uploadFiles.filter(file => {
      // Check file size
      if (file.size > maxFileSize) {
        alert(`File ${file.name} exceeds maximum size limit`);
        return false;
      }

      // Check file type
      if (allowedTypes.length > 0 && !allowedTypes.some(type => {
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.slice(0, -1));
        }
        return file.type === type;
      })) {
        alert(`File ${file.name} is not an allowed type`);
        return false;
      }

      return true;
    });

    if (validFiles.length === 0) return;

    // Call parent upload handler
    if (onFileUpload) {
      onFileUpload(validFiles);
    }

    // Simulate upload progress
    for (const file of validFiles) {
      const fileId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Add temporary file to list
      const tempFile: FileItem = {
        id: fileId,
        name: file.name,
        type: getFileType(file.type),
        size: file.size,
        mimeType: file.type,
        uploadedAt: new Date(),
        lastModified: new Date(file.lastModified),
        status: 'uploading',
        tags: [],
        encrypted: false
      };

      setFiles(prev => [tempFile, ...prev]);

      // Simulate upload progress
      for (let progress = 0; progress <= 100; progress += 10) {
        setUploadProgress(prev => ({ ...prev, [fileId]: progress }));
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Update file status
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, status: 'ready' as const } : f
      ));
      setUploadProgress(prev => {
        const { [fileId]: _, ...rest } = prev;
        return rest;
      });
    }
  }, [maxFileSize, allowedTypes, onFileUpload]);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFileUpload(droppedFiles);
  }, [handleFileUpload]);

  // Handle file selection
  const handleFileSelect = (fileId: string, selected: boolean) => {
    const newSelected = new Set(selectedFiles);
    if (selected) {
      newSelected.add(fileId);
    } else {
      newSelected.delete(fileId);
    }
    setSelectedFiles(newSelected);

    if (onFileSelect) {
      const selectedFileItems = files.filter(f => newSelected.has(f.id));
      onFileSelect(selectedFileItems);
    }
  };

  // Handle select all
  const handleSelectAll = () => {
    const allFileIds = new Set(filteredAndSortedFiles.map(f => f.id));
    setSelectedFiles(allFileIds);
    
    if (onFileSelect) {
      onFileSelect(filteredAndSortedFiles);
    }
  };

  // Handle deselect all
  const handleDeselectAll = () => {
    setSelectedFiles(new Set());
    if (onFileSelect) {
      onFileSelect([]);
    }
  };

  // Handle batch delete
  const handleBatchDelete = async () => {
    if (selectedFiles.size === 0) return;

    const fileIds = Array.from(selectedFiles);
    
    if (onFileDelete) {
      onFileDelete(fileIds);
    }

    // Remove files from local state
    setFiles(prev => prev.filter(f => !selectedFiles.has(f.id)));
    setSelectedFiles(new Set());
  };

  // Get file type from mime type
  const getFileType = (mimeType: string): FileItem['type'] => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
    return 'other';
  };

  // Get file icon
  const getFileIcon = (type: FileItem['type']) => {
    switch (type) {
      case 'image': return <Image className="w-4 h-4" />;
      case 'video': return <Video className="w-4 h-4" />;
      case 'audio': return <Music className="w-4 h-4" />;
      case 'document': return <FileText className="w-4 h-4" />;
      default: return <File className="w-4 h-4" />;
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>File Manager</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadFiles}
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              >
                {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-gray-300'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-600 mb-2">
              Drag and drop files here, or{' '}
              <label className="text-primary cursor-pointer hover:underline">
                browse
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept={allowedTypes.join(',')}
                  onChange={(e) => {
                    if (e.target.files) {
                      handleFileUpload(Array.from(e.target.files));
                    }
                  }}
                />
              </label>
            </p>
            <p className="text-xs text-gray-500">
              Maximum file size: {formatFileSize(maxFileSize)}
            </p>
          </div>

          {/* Search and Filters */}
          {(enableSearch || enableFilters) && (
            <div className="flex flex-wrap gap-4 mt-4">
              {enableSearch && (
                <div className="flex-1 min-w-64">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search files..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              )}

              {enableFilters && (
                <div className="flex gap-2">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="px-3 py-2 border rounded-md bg-white"
                  >
                    <option value="all">All Types</option>
                    <option value="image">Images</option>
                    <option value="video">Videos</option>
                    <option value="document">Documents</option>
                    <option value="audio">Audio</option>
                  </select>

                  <select
                    value={`${sortBy}-${sortOrder}`}
                    onChange={(e) => {
                      const [sort, order] = e.target.value.split('-');
                      setSortBy(sort as typeof sortBy);
                      setSortOrder(order as typeof sortOrder);
                    }}
                    className="px-3 py-2 border rounded-md bg-white"
                  >
                    <option value="date-desc">Newest First</option>
                    <option value="date-asc">Oldest First</option>
                    <option value="name-asc">Name A-Z</option>
                    <option value="name-desc">Name Z-A</option>
                    <option value="size-desc">Largest First</option>
                    <option value="size-asc">Smallest First</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Batch Actions */}
          {showBatchActions && selectedFiles.size > 0 && (
            <div className="flex items-center justify-between mt-4 p-3 bg-blue-50 rounded-lg">
              <span className="text-sm font-medium">
                {selectedFiles.size} file{selectedFiles.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                  Deselect All
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleBatchDelete}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete Selected
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* File List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              Loading files...
            </div>
          ) : filteredAndSortedFiles.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {searchQuery || filterType !== 'all' ? 'No files match your search criteria' : 'No files uploaded yet'}
            </div>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4' : 'divide-y'}>
              {filteredAndSortedFiles.map((file) => (
                <div
                  key={file.id}
                  className={`${
                    viewMode === 'grid' 
                      ? 'border rounded-lg p-3 hover:shadow-md transition-shadow' 
                      : 'p-4 hover:bg-gray-50'
                  } ${selectedFiles.has(file.id) ? 'ring-2 ring-primary' : ''}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {showBatchActions && (
                        <button
                          onClick={() => handleFileSelect(file.id, !selectedFiles.has(file.id))}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {selectedFiles.has(file.id) ? 
                            <CheckSquare className="w-4 h-4" /> : 
                            <Square className="w-4 h-4" />
                          }
                        </button>
                      )}
                      {getFileIcon(file.type)}
                    </div>
                    <div className="flex items-center gap-1">
                      {file.encrypted && <Badge variant="secondary" className="text-xs">Encrypted</Badge>}
                      <Badge variant="outline" className="text-xs">
                        {file.status}
                      </Badge>
                    </div>
                  </div>

                  {/* File thumbnail/preview */}
                  {file.type === 'image' && file.thumbnail && (
                    <div className="mb-2">
                      <img
                        src={file.thumbnail}
                        alt={file.name}
                        className="w-full h-32 object-cover rounded"
                      />
                    </div>
                  )}

                  {/* File info */}
                  <div className="space-y-1">
                    <h4 className="font-medium text-sm truncate" title={file.name}>
                      {file.name}
                    </h4>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{formatFileSize(file.size)}</span>
                      <span>{file.uploadedAt.toLocaleDateString()}</span>
                    </div>
                    
                    {file.status === 'uploading' && uploadProgress[file.id] !== undefined && (
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${uploadProgress[file.id]}%` }}
                        />
                      </div>
                    )}

                    {file.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {file.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {file.tags.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{file.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}

                    {file.expiresAt && (
                      <div className="text-xs text-orange-600">
                        Expires: {file.expiresAt.toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between mt-3 pt-2 border-t">
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* File Statistics */}
      {files.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{files.length}</div>
                <div className="text-sm text-gray-600">Total Files</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {formatFileSize(files.reduce((sum, file) => sum + file.size, 0))}
                </div>
                <div className="text-sm text-gray-600">Total Size</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {files.filter(f => f.type === 'image').length}
                </div>
                <div className="text-sm text-gray-600">Images</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {files.filter(f => f.type === 'video').length}
                </div>
                <div className="text-sm text-gray-600">Videos</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
