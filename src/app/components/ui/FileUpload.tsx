'use client';

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import { Upload, X, File, Image, Video, Music, FileText, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface FileWithPreview extends File {
  id: string;
  preview?: string;
  uploadProgress?: number;
  uploadStatus?: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  mediaMetaId?: string;
}

interface FileUploadProps {
  onFilesSelected: (files: FileWithPreview[]) => void;
  onFileRemove: (fileId: string) => void;
  onUploadStart?: (files: FileWithPreview[]) => void;
  acceptedTypes?: string[];
  maxFiles?: number;
  maxSize?: number; // in bytes
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
}

const ACCEPTED_TYPES = {
  'image/*': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  'video/*': ['video/mp4', 'video/quicktime', 'video/webm'],
  'audio/*': ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  'application/pdf': ['application/pdf'],
  'text/*': ['text/plain'],
};

export function FileUpload({
  onFilesSelected,
  onFileRemove,
  onUploadStart,
  acceptedTypes = ['image/*', 'video/*', 'audio/*', 'application/pdf'],
  maxFiles = 10,
  maxSize = 2 * 1024 * 1024 * 1024, // 2GB
  multiple = true,
  disabled = false,
  className,
}: FileUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<FileWithPreview[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate file preview URL
  const generatePreview = useCallback((file: File): string | undefined => {
    if (file.type.startsWith('image/')) {
      return URL.createObjectURL(file);
    }
    return undefined;
  }, []);

  // Validate file
  const validateFile = useCallback((file: File): string | null => {
    // Check file size
    if (file.size > maxSize) {
      return `File "${file.name}" is too large. Maximum size is ${formatFileSize(maxSize)}.`;
    }

    // Check file type
    const isAllowed = acceptedTypes.some(type => {
      if (type.includes('*')) {
        const category = type.split('/')[0];
        return file.type.startsWith(category + '/');
      }
      return file.type === type;
    });

    if (!isAllowed) {
      return `File type "${file.type}" is not allowed.`;
    }

    return null;
  }, [acceptedTypes, maxSize]);

  // Process selected files
  const processFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newFiles: FileWithPreview[] = [];
    const newErrors: string[] = [];

    // Check total file count
    if (selectedFiles.length + fileArray.length > maxFiles) {
      newErrors.push(`Cannot select more than ${maxFiles} files.`);
      setErrors(newErrors);
      return;
    }

    fileArray.forEach((file) => {
      const error = validateFile(file);
      if (error) {
        newErrors.push(error);
      } else {
        // Create FileWithPreview by adding properties to the original file
        const fileWithPreview = file as FileWithPreview;
        fileWithPreview.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        fileWithPreview.preview = generatePreview(file);
        fileWithPreview.uploadStatus = 'pending';
        
        newFiles.push(fileWithPreview);
      }
    });

    if (newErrors.length > 0) {
      setErrors(newErrors);
    } else {
      setErrors([]);
    }

    if (newFiles.length > 0) {
      const allFiles = [...selectedFiles, ...newFiles];
      setSelectedFiles(allFiles);
      onFilesSelected(allFiles);
    }
  }, [selectedFiles, maxFiles, validateFile, generatePreview, onFilesSelected]);

  // Handle file input change
  const handleFileInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
    // Reset input value to allow selecting same files again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [processFiles]);

  // Handle drag events
  const handleDragEnter = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  // Handle file removal
  const handleFileRemove = useCallback((fileId: string) => {
    const updatedFiles = selectedFiles.filter(file => file.id !== fileId);
    setSelectedFiles(updatedFiles);
    onFileRemove(fileId);
    onFilesSelected(updatedFiles);
    
    // Cleanup preview URL
    const fileToRemove = selectedFiles.find(f => f.id === fileId);
    if (fileToRemove?.preview) {
      URL.revokeObjectURL(fileToRemove.preview);
    }
  }, [selectedFiles, onFileRemove, onFilesSelected]);

  // Handle upload start
  const handleUploadStart = useCallback(() => {
    if (onUploadStart && selectedFiles.length > 0) {
      onUploadStart(selectedFiles);
    }
  }, [onUploadStart, selectedFiles]);

  // Get file icon
  const getFileIcon = (file: FileWithPreview) => {
    if (file.type.startsWith('image/')) return <Image className="w-5 h-5" />;
    if (file.type.startsWith('video/')) return <Video className="w-5 h-5" />;
    if (file.type.startsWith('audio/')) return <Music className="w-5 h-5" />;
    if (file.type === 'application/pdf' || file.type.startsWith('text/')) return <FileText className="w-5 h-5" />;
    return <File className="w-5 h-5" />;
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Drag and Drop Area */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200',
          isDragOver 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400'
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-lg font-medium text-gray-900 mb-2">
          {isDragOver ? 'Drop files here' : 'Upload files'}
        </p>
        <p className="text-sm text-gray-500 mb-4">
          Drag and drop files here, or click to browse
        </p>
        <p className="text-xs text-gray-400">
          Max {maxFiles} files • Max size {formatFileSize(maxSize)}
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        accept={acceptedTypes.join(',')}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={disabled}
      />

      {/* Error messages */}
      {errors.length > 0 && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Upload Errors
              </h3>
              <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Selected files */}
      {selectedFiles.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Selected Files ({selectedFiles.length})
          </h3>
          <div className="space-y-2">
            {selectedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center p-3 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex-shrink-0 mr-3">
                  {file.preview ? (
                    <img
                      src={file.preview}
                      alt={file.name}
                      className="w-10 h-10 object-cover rounded"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                      {getFileIcon(file)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size)} • {file.type}
                  </p>
                  {file.uploadStatus === 'uploading' && (
                    <div className="mt-1">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${file.uploadProgress || 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {file.error && (
                    <p className="text-xs text-red-500 mt-1">{file.error}</p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFileRemove(file.id);
                  }}
                  className="ml-3 p-1 text-gray-400 hover:text-red-500 transition-colors"
                  disabled={disabled || file.uploadStatus === 'uploading'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Upload button */}
          {onUploadStart && selectedFiles.length > 0 && (
            <button
              onClick={handleUploadStart}
              disabled={disabled || selectedFiles.some(f => f.uploadStatus === 'uploading')}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Upload {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to format file size
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
