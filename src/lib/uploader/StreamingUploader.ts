import { IncomingMessage } from 'http';
import { createWriteStream, promises as fs } from 'fs';
import { pipeline } from 'stream/promises';
import busboy from 'busboy';
import crypto from 'crypto';
import path from 'path';
import { MediaMetaService } from '../db';

export interface UploadProgress {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  uploaded: number;
  status: 'uploading' | 'completed' | 'error' | 'cancelled';
  error?: string;
  startTime: number;
  endTime?: number;
  storagePath?: string;
  mediaMetaId?: string;
}

export interface FileValidationOptions {
  maxSize?: number; // in bytes
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
}

export interface UploadOptions {
  validation?: FileValidationOptions;
  onProgress?: (progress: UploadProgress) => void;
  onComplete?: (progress: UploadProgress) => void;
  onError?: (progress: UploadProgress) => void;
}

export class StreamingUploader {
  private static uploads = new Map<string, UploadProgress>();
  private static readonly UPLOAD_DIR = path.join(process.cwd(), 'tmp', 'uploads');
  
  // Default validation settings
  private static readonly DEFAULT_MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
  private static readonly DEFAULT_ALLOWED_MIMES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    'application/pdf', 'text/plain',
  ];

  /**
   * Initialize uploader - ensure upload directory exists
   */
  static async initialize() {
    try {
      await fs.mkdir(this.UPLOAD_DIR, { recursive: true });
    } catch (error) {
      console.error('Failed to create upload directory:', error);
    }
  }

  /**
   * Process streaming upload from request
   */
  static async processUpload(
    req: IncomingMessage,
    options: UploadOptions = {}
  ): Promise<UploadProgress[]> {
    await this.initialize();
    
    const uploads: UploadProgress[] = [];
    const validation = {
      maxSize: options.validation?.maxSize || this.DEFAULT_MAX_SIZE,
      allowedMimeTypes: options.validation?.allowedMimeTypes || this.DEFAULT_ALLOWED_MIMES,
      allowedExtensions: options.validation?.allowedExtensions || [],
    };

    return new Promise((resolve, reject) => {
      const bb = busboy({
        headers: req.headers,
        limits: {
          fileSize: validation.maxSize,
          files: 10, // Max 10 files per upload
        },
      });

      bb.on('file', async (name, file, info) => {
        const { filename, encoding, mimeType } = info;
        const uploadId = crypto.randomUUID();
        const sanitizedFilename = this.sanitizeFilename(filename);
        const fileExtension = path.extname(sanitizedFilename);
        const uniqueFilename = `${uploadId}_${sanitizedFilename}`;
        const storagePath = path.join(this.UPLOAD_DIR, uniqueFilename);

        // Create upload progress tracker
        const progress: UploadProgress = {
          id: uploadId,
          filename: uniqueFilename,
          originalName: filename,
          mimetype: mimeType,
          size: 0,
          uploaded: 0,
          status: 'uploading',
          startTime: Date.now(),
          storagePath,
        };

        // Validate file type
        if (!this.validateMimeType(mimeType, validation.allowedMimeTypes)) {
          progress.status = 'error';
          progress.error = `File type '${mimeType}' is not allowed`;
          progress.endTime = Date.now();
          uploads.push(progress);
          options.onError?.(progress);
          file.resume(); // Drain the file stream
          return;
        }

        // Validate file extension if specified
        if (validation.allowedExtensions.length > 0 && 
            !validation.allowedExtensions.includes(fileExtension.toLowerCase())) {
          progress.status = 'error';
          progress.error = `File extension '${fileExtension}' is not allowed`;
          progress.endTime = Date.now();
          uploads.push(progress);
          options.onError?.(progress);
          file.resume();
          return;
        }

        this.uploads.set(uploadId, progress);
        uploads.push(progress);

        try {
          const writeStream = createWriteStream(storagePath);
          const hash = crypto.createHash('sha256');
          let uploadedBytes = 0;

          // Track upload progress
          file.on('data', (chunk) => {
            uploadedBytes += chunk.length;
            progress.uploaded = uploadedBytes;
            hash.update(chunk);
            options.onProgress?.(progress);
          });

          file.on('limit', () => {
            progress.status = 'error';
            progress.error = `File size exceeds limit of ${validation.maxSize} bytes`;
            progress.endTime = Date.now();
            this.uploads.set(uploadId, progress);
            options.onError?.(progress);
          });

          // Stream file to disk
          await pipeline(file, writeStream);

          // Get file stats
          const stats = await fs.stat(storagePath);
          const sha256Hash = hash.digest('hex');

          // Update progress
          progress.size = stats.size;
          progress.uploaded = stats.size;
          progress.status = 'completed';
          progress.endTime = Date.now();

          // Save metadata to database
          const mediaMeta = await MediaMetaService.create({
            filename: uniqueFilename,
            originalName: filename,
            mimetype: mimeType,
            sizeBytes: stats.size,
            storagePath,
            sha256: sha256Hash,
            isTemporary: true,
          });

          progress.mediaMetaId = mediaMeta.id;
          this.uploads.set(uploadId, progress);
          options.onComplete?.(progress);

        } catch (error) {
          progress.status = 'error';
          progress.error = error instanceof Error ? error.message : 'Upload failed';
          progress.endTime = Date.now();
          this.uploads.set(uploadId, progress);
          options.onError?.(progress);

          // Clean up partial file
          try {
            await fs.unlink(storagePath);
          } catch (cleanupError) {
            console.error('Failed to cleanup partial file:', cleanupError);
          }
        }
      });

      bb.on('error', (error) => {
        console.error('Busboy error:', error);
        reject(error);
      });

      bb.on('close', () => {
        resolve(uploads);
      });

      req.pipe(bb);
    });
  }

  /**
   * Get upload progress by ID
   */
  static getProgress(uploadId: string): UploadProgress | null {
    return this.uploads.get(uploadId) || null;
  }

  /**
   * Get all active uploads
   */
  static getAllProgress(): UploadProgress[] {
    return Array.from(this.uploads.values());
  }

  /**
   * Cancel an upload
   */
  static async cancelUpload(uploadId: string): Promise<boolean> {
    const progress = this.uploads.get(uploadId);
    if (!progress) return false;

    if (progress.status === 'uploading') {
      progress.status = 'cancelled';
      progress.endTime = Date.now();
      this.uploads.set(uploadId, progress);

      // Clean up file if it exists
      if (progress.storagePath) {
        try {
          await fs.unlink(progress.storagePath);
        } catch (error) {
          console.error('Failed to cleanup cancelled upload:', error);
        }
      }

      return true;
    }

    return false;
  }

  /**
   * Clean up completed uploads from memory
   */
  static cleanup(olderThanMinutes: number = 30) {
    const cutoff = Date.now() - (olderThanMinutes * 60 * 1000);
    
    for (const [id, progress] of this.uploads.entries()) {
      if (progress.endTime && progress.endTime < cutoff && 
          ['completed', 'error', 'cancelled'].includes(progress.status)) {
        this.uploads.delete(id);
      }
    }
  }

  /**
   * Clean up temporary files from disk
   */
  static async cleanupFiles(olderThanHours: number = 24): Promise<number> {
    try {
      const tempFiles = await MediaMetaService.getTemporaryFiles(olderThanHours);
      let cleanedCount = 0;

      for (const file of tempFiles) {
        try {
          await fs.unlink(file.storagePath);
          await MediaMetaService.delete(file.id);
          cleanedCount++;
        } catch (error) {
          console.error(`Failed to cleanup file ${file.storagePath}:`, error);
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error('Failed to cleanup files:', error);
      return 0;
    }
  }

  /**
   * Validate MIME type
   */
  private static validateMimeType(mimeType: string, allowedMimes: string[]): boolean {
    return allowedMimes.includes(mimeType) || 
           allowedMimes.some(allowed => {
             if (allowed.endsWith('/*')) {
               const category = allowed.split('/')[0];
               return mimeType.startsWith(`${category}/`);
             }
             return false;
           });
  }

  /**
   * Sanitize filename to prevent path traversal
   */
  private static sanitizeFilename(filename: string): string {
    // Remove path components and dangerous characters
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 255); // Limit filename length
  }

  /**
   * Extract media metadata (dimensions, duration, etc.)
   */
  static async extractMediaMetadata(filePath: string, mimetype: string): Promise<{
    width?: number;
    height?: number;
    duration?: number;
  }> {
    // This would typically use libraries like ffprobe, sharp, or exifr
    // For now, returning empty metadata
    // TODO: Implement with proper media analysis libraries
    return {};
  }
}
