import { StreamingUploader, UploadProgress } from './StreamingUploader';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface ChunkUploadOptions {
  chunkSize?: number; // Default 1MB chunks
  maxConcurrentChunks?: number; // Default 3
  resumable?: boolean;
}

export interface UploadQueueItem {
  id: string;
  file: File | { name: string; size: number; type: string; stream: NodeJS.ReadableStream };
  priority: number; // 1-10, higher = more priority
  options?: ChunkUploadOptions;
  progress: UploadProgress;
  chunks?: ChunkInfo[];
  resumeData?: ResumeData;
}

export interface ChunkInfo {
  index: number;
  start: number;
  end: number;
  size: number;
  uploaded: boolean;
  hash?: string;
}

export interface ResumeData {
  uploadId: string;
  totalChunks: number;
  completedChunks: number[];
  chunkSize: number;
  filename: string;
}

export interface UploadAnalytics {
  totalUploads: number;
  totalBytes: number;
  averageSpeed: number; // bytes per second
  successRate: number;
  activeUploads: number;
  queueLength: number;
  bandwidthUsage: number;
  memoryUsage: number;
}

export interface BandwidthThrottleOptions {
  maxBytesPerSecond?: number;
  adaptiveThrottling?: boolean;
  quietHours?: { start: string; end: string };
}

export class AdvancedUploader extends EventEmitter {
  private static instance: AdvancedUploader;
  private uploadQueue: UploadQueueItem[] = [];
  private activeUploads: Map<string, UploadQueueItem> = new Map();
  private resumeDataStorage = new Map<string, ResumeData>();
  private analytics: UploadAnalytics;
  private maxConcurrentUploads = 3;
  private bandwidthThrottle: BandwidthThrottleOptions = {};
  private readonly RESUME_DATA_FILE = path.join(process.cwd(), 'tmp', 'resume_data.json');
  
  // Analytics tracking
  private bytesTransferred = 0;
  private uploadStartTimes = new Map<string, number>();
  private completedUploads = 0;
  private failedUploads = 0;

  constructor() {
    super();
    this.analytics = {
      totalUploads: 0,
      totalBytes: 0,
      averageSpeed: 0,
      successRate: 0,
      activeUploads: 0,
      queueLength: 0,
      bandwidthUsage: 0,
      memoryUsage: 0,
    };
    this.loadResumeData();
    this.startAnalyticsUpdate();
  }

  public static getInstance(): AdvancedUploader {
    if (!AdvancedUploader.instance) {
      AdvancedUploader.instance = new AdvancedUploader();
    }
    return AdvancedUploader.instance;
  }

  /**
   * Add file to upload queue with priority
   */
  async addToQueue(
    file: File | { name: string; size: number; type: string; stream: NodeJS.ReadableStream },
    priority: number = 5,
    options?: ChunkUploadOptions
  ): Promise<string> {
    const uploadId = crypto.randomUUID();
    
    const queueItem: UploadQueueItem = {
      id: uploadId,
      file,
      priority,
      options: {
        chunkSize: options?.chunkSize || 1024 * 1024, // 1MB default
        maxConcurrentChunks: options?.maxConcurrentChunks || 3,
        resumable: options?.resumable ?? true,
      },
      progress: {
        id: uploadId,
        filename: file.name,
        originalName: file.name,
        mimetype: file.type,
        size: file.size,
        uploaded: 0,
        status: 'uploading',
        startTime: Date.now(),
      },
    };

    // Check if resumable and has previous data
    if (options?.resumable) {
      const resumeData = this.resumeDataStorage.get(uploadId);
      if (resumeData) {
        queueItem.resumeData = resumeData;
        queueItem.progress.uploaded = resumeData.completedChunks.length * resumeData.chunkSize;
        queueItem.progress.status = 'uploading';
      }
    }

    // Insert into queue based on priority
    const insertIndex = this.uploadQueue.findIndex(item => item.priority < priority);
    if (insertIndex === -1) {
      this.uploadQueue.push(queueItem);
    } else {
      this.uploadQueue.splice(insertIndex, 0, queueItem);
    }

    this.updateAnalytics();
    this.processQueue();

    this.emit('queued', queueItem.progress);
    return uploadId;
  }

  /**
   * Process upload queue
   */
  private async processQueue() {
    if (this.activeUploads.size >= this.maxConcurrentUploads) {
      return;
    }

    const nextItem = this.uploadQueue.shift();
    if (!nextItem) {
      return;
    }

    this.activeUploads.set(nextItem.id, nextItem);
    this.uploadStartTimes.set(nextItem.id, Date.now());
    
    try {
      if (nextItem.options?.resumable && nextItem.file.size > (nextItem.options.chunkSize || 1024 * 1024)) {
        await this.processChunkedUpload(nextItem);
      } else {
        await this.processStandardUpload(nextItem);
      }
    } catch (error) {
      this.handleUploadError(nextItem, error);
    }

    this.activeUploads.delete(nextItem.id);
    this.uploadStartTimes.delete(nextItem.id);
    this.updateAnalytics();
    
    // Process next item in queue
    setImmediate(() => this.processQueue());
  }

  /**
   * Process chunked upload with resumability
   */
  private async processChunkedUpload(item: UploadQueueItem) {
    const { file, options, progress } = item;
    const chunkSize = options?.chunkSize || 1024 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);

    // Generate chunks info
    const chunks: ChunkInfo[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      chunks.push({
        index: i,
        start,
        end,
        size: end - start,
        uploaded: item.resumeData?.completedChunks.includes(i) || false,
      });
    }

    item.chunks = chunks;
    
    // Upload chunks with concurrency limit
    const maxConcurrent = options?.maxConcurrentChunks || 3;
    const activeChunks = new Map<number, Promise<void>>();
    
    for (const chunk of chunks.filter(c => !c.uploaded)) {
      // Wait for available slot
      while (activeChunks.size >= maxConcurrent) {
        await Promise.race(activeChunks.values());
      }

      const chunkPromise = this.uploadChunk(item, chunk);
      activeChunks.set(chunk.index, chunkPromise);
      
      chunkPromise.finally(() => {
        activeChunks.delete(chunk.index);
      });
    }

    // Wait for all chunks to complete
    await Promise.all(activeChunks.values());
    
    // Finalize upload
    await this.finalizeChunkedUpload(item);
    progress.status = 'completed';
    progress.endTime = Date.now();
    
    this.completedUploads++;
    this.emit('completed', progress);
  }

  /**
   * Upload individual chunk
   */
  private async uploadChunk(item: UploadQueueItem, chunk: ChunkInfo): Promise<void> {
    const { file, progress } = item;
    
    // Apply bandwidth throttling
    await this.applyBandwidthThrottle(chunk.size);
    
    try {
      // Create chunk stream
      let chunkData: Buffer;
      
      if ('stream' in file) {
        // Handle stream file
        chunkData = await this.readChunkFromStream(file.stream, chunk.start, chunk.size);
      } else {
        // Handle File object
        const arrayBuffer = await file.slice(chunk.start, chunk.end).arrayBuffer();
        chunkData = Buffer.from(arrayBuffer);
      }

      // Upload chunk (this would integrate with your storage solution)
      await this.uploadChunkData(item.id, chunk.index, chunkData);
      
      chunk.uploaded = true;
      progress.uploaded += chunk.size;
      this.bytesTransferred += chunk.size;

      // Save resume data
      this.saveChunkProgress(item, chunk);
      
      // Emit progress update
      this.emit('progress', progress);
      
    } catch (error) {
      console.error(`Failed to upload chunk ${chunk.index}:`, error);
      throw error;
    }
  }

  /**
   * Process standard (non-chunked) upload
   */
  private async processStandardUpload(item: UploadQueueItem) {
    const { file, progress } = item;
    
    try {
      // Use existing StreamingUploader for standard uploads
      const uploads = await StreamingUploader.processUpload(
        file as any, // This would need adaptation for the new interface
        {
          onProgress: (uploadProgress) => {
            progress.uploaded = uploadProgress.uploaded;
            this.emit('progress', progress);
          },
          onComplete: (uploadProgress) => {
            progress.status = 'completed';
            progress.endTime = Date.now();
            progress.storagePath = uploadProgress.storagePath;
            progress.mediaMetaId = uploadProgress.mediaMetaId;
            this.completedUploads++;
            this.emit('completed', progress);
          },
          onError: (uploadProgress) => {
            progress.status = 'error';
            progress.error = uploadProgress.error;
            progress.endTime = Date.now();
            this.failedUploads++;
            this.emit('error', progress);
          },
        }
      );
    } catch (error) {
      this.handleUploadError(item, error);
    }
  }

  /**
   * Apply bandwidth throttling
   */
  private async applyBandwidthThrottle(chunkSize: number): Promise<void> {
    if (!this.bandwidthThrottle.maxBytesPerSecond) {
      return;
    }

    const currentSpeed = this.analytics.bandwidthUsage;
    if (currentSpeed > this.bandwidthThrottle.maxBytesPerSecond) {
      const delay = (chunkSize / this.bandwidthThrottle.maxBytesPerSecond) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Handle upload errors
   */
  private handleUploadError(item: UploadQueueItem, error: unknown) {
    item.progress.status = 'error';
    item.progress.error = error instanceof Error ? error.message : 'Upload failed';
    item.progress.endTime = Date.now();
    this.failedUploads++;
    this.emit('error', item.progress);
  }

  /**
   * Pause upload
   */
  pauseUpload(uploadId: string): boolean {
    const activeItem = this.activeUploads.get(uploadId);
    const queuedItem = this.uploadQueue.find(item => item.id === uploadId);
    
    if (activeItem) {
      activeItem.progress.status = 'cancelled';
      // Note: In a real implementation, you'd need to handle pausing active chunks
      this.emit('paused', activeItem.progress);
      return true;
    }
    
    if (queuedItem) {
      const index = this.uploadQueue.indexOf(queuedItem);
      this.uploadQueue.splice(index, 1);
      queuedItem.progress.status = 'cancelled';
      this.emit('cancelled', queuedItem.progress);
      return true;
    }
    
    return false;
  }

  /**
   * Resume upload
   */
  resumeUpload(uploadId: string): boolean {
    const resumeData = this.resumeDataStorage.get(uploadId);
    if (!resumeData) {
      return false;
    }

    // Add back to queue with resume data
    // This would need file reference restoration in a real implementation
    this.emit('resumed', { id: uploadId });
    return true;
  }

  /**
   * Set bandwidth throttling options
   */
  setBandwidthThrottle(options: BandwidthThrottleOptions) {
    this.bandwidthThrottle = { ...this.bandwidthThrottle, ...options };
  }

  /**
   * Set maximum concurrent uploads
   */
  setMaxConcurrentUploads(max: number) {
    this.maxConcurrentUploads = Math.max(1, Math.min(10, max));
  }

  /**
   * Get current analytics
   */
  getAnalytics(): UploadAnalytics {
    return { ...this.analytics };
  }

  /**
   * Get upload queue status
   */
  getQueueStatus() {
    return {
      queued: this.uploadQueue.length,
      active: this.activeUploads.size,
      total: this.uploadQueue.length + this.activeUploads.size,
    };
  }

  /**
   * Clear completed uploads from memory
   */
  clearCompleted() {
    StreamingUploader.cleanup();
  }

  /**
   * Update analytics
   */
  private updateAnalytics() {
    this.analytics.activeUploads = this.activeUploads.size;
    this.analytics.queueLength = this.uploadQueue.length;
    this.analytics.totalUploads = this.completedUploads + this.failedUploads;
    this.analytics.totalBytes = this.bytesTransferred;
    this.analytics.successRate = this.analytics.totalUploads > 0 
      ? (this.completedUploads / this.analytics.totalUploads) * 100 
      : 0;
    
    // Calculate average speed (rough estimation)
    const totalTime = Array.from(this.uploadStartTimes.values())
      .reduce((sum, start) => sum + (Date.now() - start), 0);
    this.analytics.averageSpeed = totalTime > 0 ? this.bytesTransferred / (totalTime / 1000) : 0;
    
    this.analytics.memoryUsage = process.memoryUsage().heapUsed;
  }

  /**
   * Start analytics update interval
   */
  private startAnalyticsUpdate() {
    setInterval(() => {
      this.updateAnalytics();
      this.emit('analytics_update', this.analytics);
    }, 5000); // Update every 5 seconds
  }

  /**
   * Save chunk progress for resume capability
   */
  private saveChunkProgress(item: UploadQueueItem, chunk: ChunkInfo) {
    if (!item.resumeData) {
      item.resumeData = {
        uploadId: item.id,
        totalChunks: item.chunks?.length || 0,
        completedChunks: [],
        chunkSize: item.options?.chunkSize || 1024 * 1024,
        filename: item.file.name,
      };
    }

    if (!item.resumeData.completedChunks.includes(chunk.index)) {
      item.resumeData.completedChunks.push(chunk.index);
    }

    this.resumeDataStorage.set(item.id, item.resumeData);
    this.saveResumeDataToDisk();
  }

  /**
   * Load resume data from disk
   */
  private async loadResumeData() {
    try {
      const data = await fs.readFile(this.RESUME_DATA_FILE, 'utf8');
      const resumeData = JSON.parse(data);
      this.resumeDataStorage = new Map(resumeData);
    } catch (error) {
      // File doesn't exist or is corrupted, start fresh
      this.resumeDataStorage = new Map();
    }
  }

  /**
   * Save resume data to disk
   */
  private async saveResumeDataToDisk() {
    try {
      await fs.mkdir(path.dirname(this.RESUME_DATA_FILE), { recursive: true });
      const data = Array.from(this.resumeDataStorage.entries());
      await fs.writeFile(this.RESUME_DATA_FILE, JSON.stringify(data), 'utf8');
    } catch (error) {
      console.error('Failed to save resume data:', error);
    }
  }

  /**
   * Helper methods that would be implemented based on your storage solution
   */
  private async readChunkFromStream(stream: NodeJS.ReadableStream, start: number, size: number): Promise<Buffer> {
    // Implementation would depend on the stream type
    throw new Error('Method not implemented');
  }

  private async uploadChunkData(uploadId: string, chunkIndex: number, data: Buffer): Promise<void> {
    // Implementation would integrate with your storage solution
    throw new Error('Method not implemented');
  }

  private async finalizeChunkedUpload(item: UploadQueueItem): Promise<void> {
    // Implementation would combine chunks and finalize upload
    throw new Error('Method not implemented');
  }
}
