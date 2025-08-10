import { EventEmitter } from 'events';
import { getSecurityMonitor } from '../security/SecurityMonitor';

export interface MediaValidationResult {
  isValid: boolean;
  format: string;
  mimeType: string;
  size: number;
  dimensions?: {
    width: number;
    height: number;
  };
  duration?: number; // for videos/audio
  bitrate?: number;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  compressionRatio?: number;
  metadata: Record<string, any>;
  issues: string[];
  recommendations: string[];
}

export interface MediaValidationConfig {
  maxFileSize: {
    image: number; // bytes
    video: number;
    document: number;
    audio: number;
  };
  allowedFormats: {
    image: string[];
    video: string[];
    document: string[];
    audio: string[];
  };
  qualityThresholds: {
    image: {
      minWidth: number;
      minHeight: number;
      maxWidth: number;
      maxHeight: number;
      minQuality: number; // 0-100
    };
    video: {
      minWidth: number;
      minHeight: number;
      maxWidth: number;
      maxHeight: number;
      minBitrate: number; // kbps
      maxBitrate: number;
      maxDuration: number; // seconds
    };
  };
  enableQualityAnalysis: boolean;
  enableMetadataExtraction: boolean;
  strictModeEnabled: boolean;
}

export const DEFAULT_VALIDATION_CONFIG: MediaValidationConfig = {
  maxFileSize: {
    image: 16 * 1024 * 1024, // 16MB
    video: 64 * 1024 * 1024, // 64MB
    document: 100 * 1024 * 1024, // 100MB
    audio: 16 * 1024 * 1024 // 16MB
  },
  allowedFormats: {
    image: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
    video: ['mp4', 'mov', 'avi', 'mkv', 'webm'],
    document: ['pdf', 'doc', 'docx', 'txt', 'rtf'],
    audio: ['mp3', 'wav', 'aac', 'm4a', 'ogg']
  },
  qualityThresholds: {
    image: {
      minWidth: 100,
      minHeight: 100,
      maxWidth: 4096,
      maxHeight: 4096,
      minQuality: 50
    },
    video: {
      minWidth: 240,
      minHeight: 240,
      maxWidth: 1920,
      maxHeight: 1080,
      minBitrate: 100, // 100 kbps
      maxBitrate: 5000, // 5 Mbps
      maxDuration: 300 // 5 minutes
    }
  },
  enableQualityAnalysis: true,
  enableMetadataExtraction: true,
  strictModeEnabled: false
};

export class MediaValidator extends EventEmitter {
  private config: MediaValidationConfig;
  private securityMonitor = getSecurityMonitor();

  constructor(config: MediaValidationConfig = DEFAULT_VALIDATION_CONFIG) {
    super();
    this.config = config;
  }

  /**
   * Validate media file
   */
  async validateMedia(
    buffer: Buffer,
    filename: string,
    expectedType?: 'image' | 'video' | 'document' | 'audio'
  ): Promise<MediaValidationResult> {
    try {
      const result: MediaValidationResult = {
        isValid: true,
        format: '',
        mimeType: '',
        size: buffer.length,
        quality: 'medium',
        metadata: {},
        issues: [],
        recommendations: []
      };

      // Detect file format and MIME type
      const formatInfo = this.detectFormat(buffer, filename);
      result.format = formatInfo.format;
      result.mimeType = formatInfo.mimeType;

      // Determine media type
      const mediaType = expectedType || this.getMediaTypeFromFormat(result.format);
      if (!mediaType) {
        result.isValid = false;
        result.issues.push('Unknown or unsupported media type');
        return result;
      }

      // Validate file size
      if (buffer.length > this.config.maxFileSize[mediaType]) {
        result.isValid = false;
        result.issues.push(
          `File size (${Math.round(buffer.length / 1024 / 1024)}MB) exceeds maximum allowed for ${mediaType} (${Math.round(this.config.maxFileSize[mediaType] / 1024 / 1024)}MB)`
        );
      }

      // Validate format
      if (!this.config.allowedFormats[mediaType].includes(result.format.toLowerCase())) {
        if (this.config.strictModeEnabled) {
          result.isValid = false;
          result.issues.push(`Format ${result.format} is not allowed for ${mediaType}`);
        } else {
          result.recommendations.push(`Consider converting to a supported format: ${this.config.allowedFormats[mediaType].join(', ')}`);
        }
      }

      // Perform media-specific validation
      switch (mediaType) {
        case 'image':
          await this.validateImage(buffer, result);
          break;
        case 'video':
          await this.validateVideo(buffer, result);
          break;
        case 'audio':
          await this.validateAudio(buffer, result);
          break;
        case 'document':
          await this.validateDocument(buffer, result);
          break;
      }

      // Extract metadata if enabled
      if (this.config.enableMetadataExtraction) {
        result.metadata = await this.extractMetadata(buffer, mediaType);
      }

      // Analyze quality if enabled
      if (this.config.enableQualityAnalysis) {
        result.quality = this.analyzeQuality(result, mediaType);
      }

      // Log validation result
      await this.securityMonitor.logSecurityEvent({
        type: 'file_access',
        severity: result.isValid ? 'low' : 'medium',
        source: 'MediaValidator',
        description: `Media validation ${result.isValid ? 'passed' : 'failed'}: ${filename}`,
        metadata: {
          filename,
          format: result.format,
          size: result.size,
          mediaType,
          issues: result.issues.length,
          quality: result.quality
        }
      });

      this.emit('validationComplete', { filename, result });
      return result;

    } catch (error) {
      console.error('Media validation failed:', error);
      
      const errorResult: MediaValidationResult = {
        isValid: false,
        format: 'unknown',
        mimeType: 'application/octet-stream',
        size: buffer.length,
        quality: 'low',
        metadata: {},
        issues: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        recommendations: []
      };

      this.emit('validationError', { filename, error, result: errorResult });
      return errorResult;
    }
  }

  /**
   * Detect file format and MIME type from buffer and filename
   */
  private detectFormat(buffer: Buffer, filename: string): { format: string; mimeType: string } {
    // Check magic numbers/signatures
    const signatures = [
      { signature: [0xFF, 0xD8, 0xFF], format: 'jpeg', mimeType: 'image/jpeg' },
      { signature: [0x89, 0x50, 0x4E, 0x47], format: 'png', mimeType: 'image/png' },
      { signature: [0x47, 0x49, 0x46], format: 'gif', mimeType: 'image/gif' },
      { signature: [0x52, 0x49, 0x46, 0x46], format: 'webp', mimeType: 'image/webp' }, // Actually RIFF, need more checks
      { signature: [0x00, 0x00, 0x00], format: 'mp4', mimeType: 'video/mp4' }, // Simplified MP4 detection
      { signature: [0x25, 0x50, 0x44, 0x46], format: 'pdf', mimeType: 'application/pdf' },
    ];

    // Check buffer signatures
    for (const { signature, format, mimeType } of signatures) {
      if (buffer.length >= signature.length) {
        const match = signature.every((byte, index) => buffer[index] === byte);
        if (match) {
          // Additional checks for specific formats
          if (format === 'webp' && buffer.length >= 12) {
            // Check for WEBP signature at offset 8
            if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
              return { format, mimeType };
            }
          } else if (format === 'mp4' && buffer.length >= 8) {
            // Check for ftyp box
            const ftypCheck = buffer.slice(4, 8).toString('ascii');
            if (ftypCheck.includes('ftyp') || ftypCheck.includes('mp4') || ftypCheck.includes('isom')) {
              return { format, mimeType };
            }
          } else if (format !== 'webp' && format !== 'mp4') {
            return { format, mimeType };
          }
        }
      }
    }

    // Fallback to extension-based detection
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    const extensionMap: Record<string, { format: string; mimeType: string }> = {
      'jpg': { format: 'jpeg', mimeType: 'image/jpeg' },
      'jpeg': { format: 'jpeg', mimeType: 'image/jpeg' },
      'png': { format: 'png', mimeType: 'image/png' },
      'gif': { format: 'gif', mimeType: 'image/gif' },
      'webp': { format: 'webp', mimeType: 'image/webp' },
      'mp4': { format: 'mp4', mimeType: 'video/mp4' },
      'mov': { format: 'mov', mimeType: 'video/quicktime' },
      'avi': { format: 'avi', mimeType: 'video/x-msvideo' },
      'mkv': { format: 'mkv', mimeType: 'video/x-matroska' },
      'webm': { format: 'webm', mimeType: 'video/webm' },
      'pdf': { format: 'pdf', mimeType: 'application/pdf' },
      'doc': { format: 'doc', mimeType: 'application/msword' },
      'docx': { format: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      'txt': { format: 'txt', mimeType: 'text/plain' },
      'mp3': { format: 'mp3', mimeType: 'audio/mpeg' },
      'wav': { format: 'wav', mimeType: 'audio/wav' },
      'aac': { format: 'aac', mimeType: 'audio/aac' },
      'm4a': { format: 'm4a', mimeType: 'audio/mp4' },
      'ogg': { format: 'ogg', mimeType: 'audio/ogg' }
    };

    return extensionMap[extension] || { format: 'unknown', mimeType: 'application/octet-stream' };
  }

  /**
   * Get media type from format
   */
  private getMediaTypeFromFormat(format: string): 'image' | 'video' | 'document' | 'audio' | null {
    const formatMap: Record<string, 'image' | 'video' | 'document' | 'audio'> = {
      // Images
      'jpeg': 'image', 'jpg': 'image', 'png': 'image', 'gif': 'image', 'webp': 'image',
      // Videos
      'mp4': 'video', 'mov': 'video', 'avi': 'video', 'mkv': 'video', 'webm': 'video',
      // Documents
      'pdf': 'document', 'doc': 'document', 'docx': 'document', 'txt': 'document', 'rtf': 'document',
      // Audio
      'mp3': 'audio', 'wav': 'audio', 'aac': 'audio', 'm4a': 'audio', 'ogg': 'audio'
    };

    return formatMap[format.toLowerCase()] || null;
  }

  /**
   * Validate image-specific properties
   */
  private async validateImage(buffer: Buffer, result: MediaValidationResult): Promise<void> {
    try {
      // Basic image dimension extraction (simplified)
      const dimensions = this.extractImageDimensions(buffer, result.format);
      if (dimensions) {
        result.dimensions = dimensions;
        
        const { minWidth, minHeight, maxWidth, maxHeight } = this.config.qualityThresholds.image;
        
        if (dimensions.width < minWidth || dimensions.height < minHeight) {
          result.issues.push(`Image dimensions (${dimensions.width}x${dimensions.height}) are below minimum (${minWidth}x${minHeight})`);
        }
        
        if (dimensions.width > maxWidth || dimensions.height > maxHeight) {
          result.recommendations.push(`Consider resizing image. Current: ${dimensions.width}x${dimensions.height}, recommended max: ${maxWidth}x${maxHeight}`);
        }
      }

      // Estimate compression ratio
      if (result.dimensions) {
        const uncompressedSize = result.dimensions.width * result.dimensions.height * 3; // RGB
        result.compressionRatio = uncompressedSize / buffer.length;
      }

    } catch (error) {
      result.issues.push(`Image analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate video-specific properties
   */
  private async validateVideo(buffer: Buffer, result: MediaValidationResult): Promise<void> {
    try {
      // Basic video analysis (simplified - would need proper video parsing library)
      // For now, we'll do basic checks based on file size and format
      
      const { maxDuration, minBitrate, maxBitrate } = this.config.qualityThresholds.video;
      
      // Estimate bitrate based on file size (very rough estimate)
      // This would need proper video parsing for accurate results
      const estimatedDuration = 60; // Assume 60 seconds for estimation
      const estimatedBitrate = (buffer.length * 8) / (estimatedDuration * 1000); // kbps
      
      result.bitrate = estimatedBitrate;
      result.duration = estimatedDuration;
      
      if (estimatedBitrate < minBitrate) {
        result.issues.push(`Video bitrate appears low (${Math.round(estimatedBitrate)} kbps), minimum recommended: ${minBitrate} kbps`);
      }
      
      if (estimatedBitrate > maxBitrate) {
        result.recommendations.push(`Video bitrate appears high (${Math.round(estimatedBitrate)} kbps), consider compressing. Max recommended: ${maxBitrate} kbps`);
      }

    } catch (error) {
      result.issues.push(`Video analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate audio-specific properties
   */
  private async validateAudio(buffer: Buffer, result: MediaValidationResult): Promise<void> {
    try {
      // Basic audio analysis (simplified)
      // Would need proper audio parsing library for detailed analysis
      
      // Check for basic audio format validity
      if (result.format === 'mp3') {
        // Check for MP3 frame header
        const hasValidHeader = this.checkMP3Header(buffer);
        if (!hasValidHeader) {
          result.issues.push('Invalid MP3 format detected');
        }
      }

    } catch (error) {
      result.issues.push(`Audio analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate document-specific properties
   */
  private async validateDocument(buffer: Buffer, result: MediaValidationResult): Promise<void> {
    try {
      // Basic document validation
      if (result.format === 'pdf') {
        // Check PDF structure
        const pdfVersion = this.extractPDFVersion(buffer);
        if (pdfVersion) {
          result.metadata.pdfVersion = pdfVersion;
        }
      }

      // Check for potentially malicious content (simplified)
      const suspiciousPatterns = [
        Buffer.from('javascript:', 'utf8'),
        Buffer.from('<script', 'utf8'),
        Buffer.from('eval(', 'utf8')
      ];

      for (const pattern of suspiciousPatterns) {
        if (buffer.indexOf(pattern) !== -1) {
          result.issues.push('Document contains potentially suspicious content');
          break;
        }
      }

    } catch (error) {
      result.issues.push(`Document analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract basic image dimensions (simplified implementation)
   */
  private extractImageDimensions(buffer: Buffer, format: string): { width: number; height: number } | null {
    try {
      switch (format.toLowerCase()) {
        case 'png':
          if (buffer.length >= 24) {
            const width = buffer.readUInt32BE(16);
            const height = buffer.readUInt32BE(20);
            return { width, height };
          }
          break;
        case 'jpeg':
        case 'jpg':
          // Simplified JPEG dimension extraction
          // Would need proper JPEG parsing for accurate results
          return this.extractJPEGDimensions(buffer);
        case 'gif':
          if (buffer.length >= 10) {
            const width = buffer.readUInt16LE(6);
            const height = buffer.readUInt16LE(8);
            return { width, height };
          }
          break;
      }
    } catch (error) {
      console.error('Failed to extract image dimensions:', error);
    }
    return null;
  }

  /**
   * Extract JPEG dimensions (simplified)
   */
  private extractJPEGDimensions(buffer: Buffer): { width: number; height: number } | null {
    try {
      let offset = 2; // Skip SOI marker
      
      while (offset < buffer.length - 4) {
        const marker = buffer.readUInt16BE(offset);
        
        if (marker >= 0xFFC0 && marker <= 0xFFCF && marker !== 0xFFC4 && marker !== 0xFFC8 && marker !== 0xFFCC) {
          // SOF marker found
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        
        const segmentLength = buffer.readUInt16BE(offset + 2);
        offset += 2 + segmentLength;
      }
    } catch (error) {
      console.error('Failed to extract JPEG dimensions:', error);
    }
    return null;
  }

  /**
   * Check MP3 header validity (simplified)
   */
  private checkMP3Header(buffer: Buffer): boolean {
    if (buffer.length < 4) return false;
    
    // Check for MP3 frame sync
    return buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0;
  }

  /**
   * Extract PDF version
   */
  private extractPDFVersion(buffer: Buffer): string | null {
    try {
      const header = buffer.slice(0, 8).toString('ascii');
      const match = header.match(/%PDF-(\d\.\d)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Extract metadata from media file
   */
  private async extractMetadata(buffer: Buffer, mediaType: string): Promise<Record<string, any>> {
    const metadata: Record<string, any> = {
      size: buffer.length,
      mediaType,
      extractedAt: new Date().toISOString()
    };

    try {
      // Basic metadata extraction based on media type
      switch (mediaType) {
        case 'image':
          // Extract basic image metadata
          metadata.colorDepth = this.estimateColorDepth(buffer);
          break;
        case 'video':
          // Extract basic video metadata
          metadata.estimatedFrameRate = 30; // Default estimate
          break;
        case 'document':
          // Extract document metadata
          if (buffer.slice(0, 4).toString() === '%PDF') {
            metadata.documentType = 'PDF';
            metadata.version = this.extractPDFVersion(buffer);
          }
          break;
      }
    } catch (error) {
      metadata.extractionError = error instanceof Error ? error.message : 'Unknown error';
    }

    return metadata;
  }

  /**
   * Estimate color depth (simplified)
   */
  private estimateColorDepth(buffer: Buffer): number {
    // Very basic estimation - would need proper image parsing
    return 24; // Assume 24-bit color depth
  }

  /**
   * Analyze media quality
   */
  private analyzeQuality(result: MediaValidationResult, mediaType: string): 'low' | 'medium' | 'high' | 'ultra' {
    let score = 0;
    
    // Base score on file size relative to content
    if (result.dimensions) {
      const pixelCount = result.dimensions.width * result.dimensions.height;
      const bytesPerPixel = result.size / pixelCount;
      
      if (bytesPerPixel > 3) score += 30; // High compression
      else if (bytesPerPixel > 1) score += 20; // Medium compression
      else score += 10; // Low compression
    }

    // Factor in format quality
    const highQualityFormats = ['png', 'tiff', 'bmp'];
    const mediumQualityFormats = ['jpeg', 'jpg', 'mp4', 'mov'];
    
    if (highQualityFormats.includes(result.format.toLowerCase())) {
      score += 25;
    } else if (mediumQualityFormats.includes(result.format.toLowerCase())) {
      score += 15;
    } else {
      score += 5;
    }

    // Factor in dimensions for images/videos
    if (result.dimensions && mediaType === 'image') {
      const totalPixels = result.dimensions.width * result.dimensions.height;
      if (totalPixels > 2000000) score += 25; // > 2MP
      else if (totalPixels > 500000) score += 15; // > 0.5MP
      else score += 5;
    }

    // Factor in bitrate for videos
    if (result.bitrate && mediaType === 'video') {
      if (result.bitrate > 2000) score += 25; // > 2 Mbps
      else if (result.bitrate > 1000) score += 15; // > 1 Mbps
      else score += 5;
    }

    // Determine quality level
    if (score >= 70) return 'ultra';
    if (score >= 50) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  /**
   * Update validation configuration
   */
  updateConfig(newConfig: Partial<MediaValidationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): MediaValidationConfig {
    return { ...this.config };
  }
}

// Global media validator instance
let mediaValidator: MediaValidator | null = null;

export function getMediaValidator(config?: MediaValidationConfig): MediaValidator {
  if (!mediaValidator) {
    mediaValidator = new MediaValidator(config);
  }
  return mediaValidator;
}

export function resetMediaValidator(): void {
  mediaValidator = null;
}
