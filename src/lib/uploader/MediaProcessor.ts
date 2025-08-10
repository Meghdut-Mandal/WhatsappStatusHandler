import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import crypto from 'crypto';
import path from 'path';

export interface MediaInfo {
  width?: number;
  height?: number;
  duration?: number;
  bitrate?: number;
  framerate?: number;
  format?: string;
  hasAudio?: boolean;
  hasVideo?: boolean;
}

export interface ProcessedMedia {
  originalPath: string;
  mimetype: string;
  size: number;
  sha256: string;
  mediaInfo: MediaInfo;
}

export class MediaProcessor {
  /**
   * Extract comprehensive metadata from media file
   */
  static async extractMetadata(filePath: string, mimetype: string): Promise<MediaInfo> {
    const mediaInfo: MediaInfo = {};

    try {
      if (mimetype.startsWith('image/')) {
        return await this.extractImageMetadata(filePath, mimetype);
      } else if (mimetype.startsWith('video/')) {
        return await this.extractVideoMetadata(filePath, mimetype);
      } else if (mimetype.startsWith('audio/')) {
        return await this.extractAudioMetadata(filePath, mimetype);
      }
    } catch (error) {
      console.error('Failed to extract metadata:', error);
    }

    return mediaInfo;
  }

  /**
   * Extract image metadata (basic implementation)
   * In production, you would use libraries like 'sharp' or 'exifr'
   */
  private static async extractImageMetadata(filePath: string, mimetype: string): Promise<MediaInfo> {
    // This is a simplified implementation
    // In a real app, you'd use sharp, exifr, or similar libraries
    const stats = await fs.stat(filePath);
    
    return {
      format: mimetype.split('/')[1],
      // TODO: Implement actual image dimension extraction
      // width: dimensions.width,
      // height: dimensions.height,
    };
  }

  /**
   * Extract video metadata (basic implementation)
   * In production, you would use 'ffprobe' or similar
   */
  private static async extractVideoMetadata(filePath: string, mimetype: string): Promise<MediaInfo> {
    // This is a simplified implementation
    // In a real app, you'd use ffprobe to get video metadata
    return {
      format: mimetype.split('/')[1],
      hasVideo: true,
      hasAudio: true, // Most videos have audio
      // TODO: Implement actual video metadata extraction
      // width: videoInfo.width,
      // height: videoInfo.height,
      // duration: videoInfo.duration,
      // bitrate: videoInfo.bitrate,
      // framerate: videoInfo.framerate,
    };
  }

  /**
   * Extract audio metadata (basic implementation)
   */
  private static async extractAudioMetadata(filePath: string, mimetype: string): Promise<MediaInfo> {
    // This is a simplified implementation
    // In a real app, you'd use libraries to get audio metadata
    return {
      format: mimetype.split('/')[1],
      hasAudio: true,
      // TODO: Implement actual audio metadata extraction
      // duration: audioInfo.duration,
      // bitrate: audioInfo.bitrate,
    };
  }

  /**
   * Calculate file hash
   */
  static async calculateSHA256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);

      stream.on('data', (data) => {
        hash.update(data);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', reject);
    });
  }

  /**
   * Process media file completely
   */
  static async processMedia(filePath: string, mimetype: string): Promise<ProcessedMedia> {
    const [stats, sha256, mediaInfo] = await Promise.all([
      fs.stat(filePath),
      this.calculateSHA256(filePath),
      this.extractMetadata(filePath, mimetype),
    ]);

    return {
      originalPath: filePath,
      mimetype,
      size: stats.size,
      sha256,
      mediaInfo,
    };
  }

  /**
   * Validate media file integrity
   */
  static async validateMedia(filePath: string, expectedHash?: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      
      if (expectedHash) {
        const actualHash = await this.calculateSHA256(filePath);
        return actualHash === expectedHash;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get supported MIME types for different categories
   */
  static getSupportedMimeTypes() {
    return {
      images: [
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        'image/bmp',
        'image/tiff',
      ],
      videos: [
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo', // .avi
        'video/webm',
        'video/ogg',
        'video/3gpp',
        'video/x-ms-wmv',
      ],
      audio: [
        'audio/mpeg', // .mp3
        'audio/wav',
        'audio/ogg',
        'audio/aac',
        'audio/webm',
        'audio/x-m4a',
      ],
      documents: [
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
    };
  }

  /**
   * Check if file type is supported for WhatsApp
   */
  static isWhatsAppSupported(mimetype: string): boolean {
    const supported = this.getSupportedMimeTypes();
    const allSupported = [
      ...supported.images,
      ...supported.videos,
      ...supported.audio,
      ...supported.documents,
    ];
    
    return allSupported.includes(mimetype);
  }

  /**
   * Get file category from MIME type
   */
  static getFileCategory(mimetype: string): 'image' | 'video' | 'audio' | 'document' | 'unknown' {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.startsWith('text/') || mimetype.includes('document') || mimetype === 'application/pdf') {
      return 'document';
    }
    return 'unknown';
  }

  /**
   * Format file size in human readable format
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration in human readable format
   */
  static formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  }
}
