import { MediaProcessor, ProcessedMedia } from './MediaProcessor';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface FileProcessingOptions {
  sendAsDocument?: boolean;
  preserveQuality?: boolean;
  enableCompression?: boolean;
  compressionLevel?: number; // 1-10
  captionText?: string;
  captionPlacement?: 'top' | 'bottom';
  watermark?: {
    enabled: boolean;
    text?: string;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    opacity?: number; // 0-1
  };
  batchId?: string;
}

export interface BatchProcessingOptions {
  batchId: string;
  files: string[]; // File IDs or paths
  processingOptions: FileProcessingOptions;
  sequenceOrder?: number[];
  scheduleTime?: Date;
  intervalBetween?: number; // milliseconds
}

export interface ProcessedFile {
  originalId: string;
  processedPath: string;
  originalPath: string;
  filename: string;
  mimetype: string;
  size: number;
  processedSize: number;
  compressionRatio?: number;
  processingTime: number;
  options: FileProcessingOptions;
  metadata: ProcessedMedia;
  preview?: string; // Base64 preview for UI
}

export interface BatchProcessingResult {
  batchId: string;
  totalFiles: number;
  processedFiles: ProcessedFile[];
  failedFiles: Array<{ fileId: string; error: string }>;
  totalProcessingTime: number;
  totalSizeBefore: number;
  totalSizeAfter: number;
  averageCompressionRatio: number;
}

export class FileProcessor {
  private static instance: FileProcessor;
  private processingQueue: Map<string, BatchProcessingOptions> = new Map();
  private activeProcessing: Set<string> = new Set();
  private readonly PROCESSED_DIR = path.join(process.cwd(), 'tmp', 'processed');

  constructor() {
    this.ensureProcessedDir();
  }

  public static getInstance(): FileProcessor {
    if (!FileProcessor.instance) {
      FileProcessor.instance = new FileProcessor();
    }
    return FileProcessor.instance;
  }

  /**
   * Ensure processed files directory exists
   */
  private async ensureProcessedDir() {
    try {
      await fs.mkdir(this.PROCESSED_DIR, { recursive: true });
    } catch (error) {
      console.error('Failed to create processed directory:', error);
    }
  }

  /**
   * Process single file with options
   */
  async processFile(
    filePath: string,
    filename: string,
    mimetype: string,
    options: FileProcessingOptions = {}
  ): Promise<ProcessedFile> {
    const startTime = Date.now();
    const fileId = crypto.randomUUID();

    try {
      // Get original file metadata
      const originalStats = await fs.stat(filePath);
      const originalMetadata = await MediaProcessor.processMedia(filePath, mimetype);

      // Determine processing path
      let processedPath = filePath;
      let processedSize = originalStats.size;

      // Apply processing based on options
      if (options.sendAsDocument) {
        // For document sending, just copy the file
        processedPath = await this.copyFileForProcessing(filePath, fileId, filename);
      } else if (this.shouldProcessFile(mimetype, options)) {
        processedPath = await this.processMediaFile(filePath, fileId, mimetype, options);
        const processedStats = await fs.stat(processedPath);
        processedSize = processedStats.size;
      } else {
        // Just copy the original file
        processedPath = await this.copyFileForProcessing(filePath, fileId, filename);
      }

      // Generate preview if needed
      const preview = await this.generatePreview(processedPath, mimetype);

      const processingTime = Date.now() - startTime;
      const compressionRatio = processedSize < originalStats.size 
        ? (1 - processedSize / originalStats.size) * 100 
        : 0;

      // Add caption processing if specified
      if (options.captionText) {
        // Caption would be handled at send time, not file processing time
      }

      const result: ProcessedFile = {
        originalId: fileId,
        processedPath,
        originalPath: filePath,
        filename,
        mimetype,
        size: originalStats.size,
        processedSize,
        compressionRatio,
        processingTime,
        options,
        metadata: originalMetadata,
        preview,
      };

      return result;

    } catch (error) {
      console.error('File processing failed:', error);
      throw new Error(`Failed to process file ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process batch of files
   */
  async processBatch(batchOptions: BatchProcessingOptions): Promise<BatchProcessingResult> {
    const { batchId, files, processingOptions, sequenceOrder } = batchOptions;
    const startTime = Date.now();

    if (this.activeProcessing.has(batchId)) {
      throw new Error(`Batch ${batchId} is already being processed`);
    }

    this.activeProcessing.add(batchId);
    this.processingQueue.set(batchId, batchOptions);

    try {
      const processedFiles: ProcessedFile[] = [];
      const failedFiles: Array<{ fileId: string; error: string }> = [];

      // Determine processing order
      const orderedFiles = sequenceOrder 
        ? sequenceOrder.map(index => files[index]).filter(Boolean)
        : files;

      // Process files in order or parallel based on options
      for (let i = 0; i < orderedFiles.length; i++) {
        const filePath = orderedFiles[i];
        
        try {
          // Apply interval between files if specified
          if (i > 0 && batchOptions.intervalBetween) {
            await new Promise(resolve => setTimeout(resolve, batchOptions.intervalBetween));
          }

          const filename = path.basename(filePath);
          const mimetype = this.getMimetypeFromExtension(path.extname(filePath));
          
          const processedFile = await this.processFile(filePath, filename, mimetype, processingOptions);
          processedFiles.push(processedFile);

        } catch (error) {
          failedFiles.push({
            fileId: filePath,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const totalProcessingTime = Date.now() - startTime;
      const totalSizeBefore = processedFiles.reduce((sum, file) => sum + file.size, 0);
      const totalSizeAfter = processedFiles.reduce((sum, file) => sum + file.processedSize, 0);
      const averageCompressionRatio = processedFiles.length > 0
        ? processedFiles.reduce((sum, file) => sum + (file.compressionRatio || 0), 0) / processedFiles.length
        : 0;

      const result: BatchProcessingResult = {
        batchId,
        totalFiles: files.length,
        processedFiles,
        failedFiles,
        totalProcessingTime,
        totalSizeBefore,
        totalSizeAfter,
        averageCompressionRatio,
      };

      return result;

    } finally {
      this.activeProcessing.delete(batchId);
      this.processingQueue.delete(batchId);
    }
  }

  /**
   * Schedule batch processing
   */
  async scheduleBatch(batchOptions: BatchProcessingOptions): Promise<string> {
    if (!batchOptions.scheduleTime) {
      throw new Error('Schedule time is required for scheduled processing');
    }

    const delay = batchOptions.scheduleTime.getTime() - Date.now();
    if (delay <= 0) {
      throw new Error('Schedule time must be in the future');
    }

    const timeoutId = setTimeout(async () => {
      try {
        await this.processBatch(batchOptions);
      } catch (error) {
        console.error(`Scheduled batch processing failed for ${batchOptions.batchId}:`, error);
      }
    }, delay);

    return batchOptions.batchId;
  }

  /**
   * Get processing queue status
   */
  getQueueStatus() {
    return {
      active: Array.from(this.activeProcessing),
      queued: Array.from(this.processingQueue.keys()),
      totalActive: this.activeProcessing.size,
      totalQueued: this.processingQueue.size,
    };
  }

  /**
   * Cancel batch processing
   */
  cancelBatch(batchId: string): boolean {
    if (this.activeProcessing.has(batchId)) {
      // Note: In a real implementation, you'd need to handle canceling active processing
      this.activeProcessing.delete(batchId);
      this.processingQueue.delete(batchId);
      return true;
    }
    return false;
  }

  /**
   * Get supported file processing options for a file type
   */
  getSupportedOptions(mimetype: string): Partial<FileProcessingOptions> {
    const category = MediaProcessor.getFileCategory(mimetype);
    
    const baseOptions: Partial<FileProcessingOptions> = {
      sendAsDocument: true,
      captionText: true,
      captionPlacement: true,
    };

    switch (category) {
      case 'image':
        return {
          ...baseOptions,
          preserveQuality: true,
          enableCompression: true,
          compressionLevel: true,
          watermark: true,
        };
      
      case 'video':
        return {
          ...baseOptions,
          preserveQuality: true,
          enableCompression: true,
          compressionLevel: true,
        };
      
      case 'audio':
        return {
          ...baseOptions,
          enableCompression: true,
          compressionLevel: true,
        };
      
      case 'document':
        return baseOptions;
      
      default:
        return baseOptions;
    }
  }

  /**
   * Cleanup processed files older than specified hours
   */
  async cleanupProcessedFiles(olderThanHours: number = 24): Promise<number> {
    try {
      const files = await fs.readdir(this.PROCESSED_DIR);
      const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.PROCESSED_DIR, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          cleanedCount++;
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error('Failed to cleanup processed files:', error);
      return 0;
    }
  }

  /**
   * Private helper methods
   */
  private shouldProcessFile(mimetype: string, options: FileProcessingOptions): boolean {
    if (options.sendAsDocument) return false;
    if (options.enableCompression) return true;
    if (options.watermark?.enabled) return true;
    return false;
  }

  private async copyFileForProcessing(filePath: string, fileId: string, filename: string): Promise<string> {
    const extension = path.extname(filename);
    const processedFilename = `${fileId}_${Date.now()}${extension}`;
    const processedPath = path.join(this.PROCESSED_DIR, processedFilename);
    
    await fs.copyFile(filePath, processedPath);
    return processedPath;
  }

  private async processMediaFile(
    filePath: string, 
    fileId: string, 
    mimetype: string, 
    options: FileProcessingOptions
  ): Promise<string> {
    const extension = path.extname(filePath);
    const processedFilename = `${fileId}_processed_${Date.now()}${extension}`;
    const processedPath = path.join(this.PROCESSED_DIR, processedFilename);

    if (mimetype.startsWith('image/')) {
      return this.processImage(filePath, processedPath, options);
    } else if (mimetype.startsWith('video/')) {
      return this.processVideo(filePath, processedPath, options);
    } else if (mimetype.startsWith('audio/')) {
      return this.processAudio(filePath, processedPath, options);
    } else {
      // For other file types, just copy
      await fs.copyFile(filePath, processedPath);
      return processedPath;
    }
  }

  private async processImage(
    inputPath: string, 
    outputPath: string, 
    options: FileProcessingOptions
  ): Promise<string> {
    // In a real implementation, you would use libraries like Sharp for image processing
    // For now, just copy the file
    await fs.copyFile(inputPath, outputPath);
    
    // TODO: Implement actual image processing with Sharp
    // - Compression
    // - Watermarking  
    // - Quality adjustment
    
    return outputPath;
  }

  private async processVideo(
    inputPath: string, 
    outputPath: string, 
    options: FileProcessingOptions
  ): Promise<string> {
    // In a real implementation, you would use FFmpeg for video processing
    // For now, just copy the file
    await fs.copyFile(inputPath, outputPath);
    
    // TODO: Implement actual video processing with FFmpeg
    // - Compression
    // - Quality adjustment
    // - Format conversion if needed
    
    return outputPath;
  }

  private async processAudio(
    inputPath: string, 
    outputPath: string, 
    options: FileProcessingOptions
  ): Promise<string> {
    // In a real implementation, you would use FFmpeg for audio processing
    // For now, just copy the file
    await fs.copyFile(inputPath, outputPath);
    
    // TODO: Implement actual audio processing
    // - Compression
    // - Quality adjustment
    // - Format conversion if needed
    
    return outputPath;
  }

  private async generatePreview(filePath: string, mimetype: string): Promise<string | undefined> {
    try {
      if (mimetype.startsWith('image/')) {
        // Generate thumbnail for images
        const buffer = await fs.readFile(filePath);
        // TODO: Use Sharp to create thumbnail and convert to base64
        return `data:${mimetype};base64,${buffer.toString('base64')}`;
      }
      // For videos, you could generate a frame thumbnail
      // For other files, return undefined
      return undefined;
    } catch (error) {
      console.error('Failed to generate preview:', error);
      return undefined;
    }
  }

  private getMimetypeFromExtension(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }
}

export default FileProcessor;
