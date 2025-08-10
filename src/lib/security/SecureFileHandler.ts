import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { encryptAdvanced, decryptAdvanced, hashData, generateSecureRandom, EncryptionConfig, DEFAULT_ENCRYPTION_CONFIG } from '../db/crypto';
import { getSecurityMonitor } from './SecurityMonitor';

export interface SecureFileOptions {
  encrypt: boolean;
  password?: string;
  encryptionConfig?: EncryptionConfig;
  autoCleanup: boolean;
  cleanupAfterMinutes?: number;
  maxFileSize?: number; // in bytes
  allowedMimeTypes?: string[];
  quarantineOnSuspicious?: boolean;
}

export interface SecureFileMetadata {
  id: string;
  originalName: string;
  securePath: string;
  size: number;
  mimeType: string;
  hash: string;
  encrypted: boolean;
  createdAt: Date;
  expiresAt?: Date;
  accessCount: number;
  lastAccessed: Date;
}

export interface FileAccessLog {
  fileId: string;
  action: 'create' | 'read' | 'write' | 'delete' | 'encrypt' | 'decrypt';
  timestamp: Date;
  success: boolean;
  userAgent?: string;
  ipAddress?: string;
  error?: string;
}

export class SecureFileHandler extends EventEmitter {
  private secureDirectory: string;
  private quarantineDirectory: string;
  private metadata: Map<string, SecureFileMetadata> = new Map();
  private accessLogs: FileAccessLog[] = [];
  private cleanupIntervals: Map<string, NodeJS.Timeout> = new Map();
  private securityMonitor = getSecurityMonitor();

  constructor(secureDirectory: string = path.join(process.cwd(), 'secure_files')) {
    super();
    this.secureDirectory = secureDirectory;
    this.quarantineDirectory = path.join(secureDirectory, 'quarantine');
    this.initializeDirectories();
    this.startPeriodicCleanup();
  }

  private async initializeDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.secureDirectory, { recursive: true, mode: 0o700 });
      await fs.mkdir(this.quarantineDirectory, { recursive: true, mode: 0o700 });
    } catch (error) {
      console.error('Failed to initialize secure directories:', error);
      throw error;
    }
  }

  /**
   * Store a file securely
   */
  async storeFile(
    fileBuffer: Buffer,
    originalName: string,
    options: SecureFileOptions
  ): Promise<SecureFileMetadata> {
    const fileId = this.generateFileId();
    const timestamp = new Date();

    try {
      // Validate file
      await this.validateFile(fileBuffer, originalName, options);

      // Generate secure path
      const extension = path.extname(originalName);
      const securePath = path.join(this.secureDirectory, `${fileId}${extension}.secure`);

      // Prepare file data
      let fileData = fileBuffer;
      let encrypted = false;

      if (options.encrypt) {
        const encryptedData = await encryptAdvanced(
          fileBuffer.toString('base64'),
          options.password,
          options.encryptionConfig || DEFAULT_ENCRYPTION_CONFIG
        );
        fileData = Buffer.from(encryptedData);
        encrypted = true;
      }

      // Write file with restricted permissions
      await fs.writeFile(securePath, fileData, { mode: 0o600 });

      // Create metadata
      const metadata: SecureFileMetadata = {
        id: fileId,
        originalName,
        securePath,
        size: fileBuffer.length,
        mimeType: this.detectMimeType(originalName, fileBuffer),
        hash: hashData(fileBuffer),
        encrypted,
        createdAt: timestamp,
        expiresAt: options.autoCleanup && options.cleanupAfterMinutes 
          ? new Date(timestamp.getTime() + options.cleanupAfterMinutes * 60000)
          : undefined,
        accessCount: 0,
        lastAccessed: timestamp
      };

      this.metadata.set(fileId, metadata);

      // Log access
      this.logFileAccess({
        fileId,
        action: 'create',
        timestamp,
        success: true
      });

      // Schedule cleanup if needed
      if (options.autoCleanup && options.cleanupAfterMinutes) {
        this.scheduleCleanup(fileId, options.cleanupAfterMinutes);
      }

      // Log security event
      await this.securityMonitor.logSecurityEvent({
        type: 'file_access',
        severity: 'low',
        source: 'SecureFileHandler',
        description: `File stored securely: ${originalName}`,
        metadata: {
          fileId,
          originalName,
          size: fileBuffer.length,
          encrypted,
          autoCleanup: options.autoCleanup
        }
      });

      this.emit('fileStored', metadata);
      return metadata;

    } catch (error) {
      // Log failed access
      this.logFileAccess({
        fileId,
        action: 'create',
        timestamp,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      await this.securityMonitor.logSecurityEvent({
        type: 'file_access',
        severity: 'medium',
        source: 'SecureFileHandler',
        description: `Failed to store file: ${originalName}`,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          originalName
        }
      });

      throw error;
    }
  }

  /**
   * Retrieve a file securely
   */
  async retrieveFile(fileId: string, password?: string): Promise<{
    buffer: Buffer;
    metadata: SecureFileMetadata;
  }> {
    const timestamp = new Date();
    
    try {
      const metadata = this.metadata.get(fileId);
      if (!metadata) {
        throw new Error('File not found');
      }

      // Check if file has expired
      if (metadata.expiresAt && metadata.expiresAt < timestamp) {
        await this.deleteFile(fileId);
        throw new Error('File has expired');
      }

      // Read file
      const fileData = await fs.readFile(metadata.securePath);

      let fileBuffer: Buffer;
      if (metadata.encrypted) {
        if (!password) {
          throw new Error('Password required for encrypted file');
        }
        const decryptedData = await decryptAdvanced(fileData.toString(), password);
        fileBuffer = Buffer.from(decryptedData, 'base64');
      } else {
        fileBuffer = fileData;
      }

      // Verify file integrity
      const currentHash = hashData(fileBuffer);
      if (currentHash !== metadata.hash) {
        // File has been tampered with - quarantine it
        await this.quarantineFile(fileId, 'File integrity check failed');
        throw new Error('File integrity check failed');
      }

      // Update metadata
      metadata.accessCount++;
      metadata.lastAccessed = timestamp;
      this.metadata.set(fileId, metadata);

      // Log access
      this.logFileAccess({
        fileId,
        action: 'read',
        timestamp,
        success: true
      });

      this.emit('fileAccessed', metadata);
      return { buffer: fileBuffer, metadata };

    } catch (error) {
      // Log failed access
      this.logFileAccess({
        fileId,
        action: 'read',
        timestamp,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      await this.securityMonitor.logSecurityEvent({
        type: 'file_access',
        severity: 'medium',
        source: 'SecureFileHandler',
        description: `Failed to retrieve file: ${fileId}`,
        metadata: {
          fileId,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      throw error;
    }
  }

  /**
   * Delete a file securely
   */
  async deleteFile(fileId: string): Promise<void> {
    const timestamp = new Date();

    try {
      const metadata = this.metadata.get(fileId);
      if (!metadata) {
        throw new Error('File not found');
      }

      // Securely overwrite file before deletion
      await this.secureDelete(metadata.securePath);

      // Remove metadata
      this.metadata.delete(fileId);

      // Cancel cleanup timer if exists
      const cleanupTimer = this.cleanupIntervals.get(fileId);
      if (cleanupTimer) {
        clearTimeout(cleanupTimer);
        this.cleanupIntervals.delete(fileId);
      }

      // Log access
      this.logFileAccess({
        fileId,
        action: 'delete',
        timestamp,
        success: true
      });

      await this.securityMonitor.logSecurityEvent({
        type: 'file_access',
        severity: 'low',
        source: 'SecureFileHandler',
        description: `File deleted securely: ${metadata.originalName}`,
        metadata: {
          fileId,
          originalName: metadata.originalName
        }
      });

      this.emit('fileDeleted', metadata);

    } catch (error) {
      // Log failed access
      this.logFileAccess({
        fileId,
        action: 'delete',
        timestamp,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }
  }

  /**
   * Quarantine a suspicious file
   */
  private async quarantineFile(fileId: string, reason: string): Promise<void> {
    try {
      const metadata = this.metadata.get(fileId);
      if (!metadata) return;

      const quarantinePath = path.join(this.quarantineDirectory, `${fileId}_quarantine`);
      
      // Move file to quarantine
      await fs.rename(metadata.securePath, quarantinePath);
      
      // Update metadata
      metadata.securePath = quarantinePath;
      this.metadata.set(fileId, metadata);

      await this.securityMonitor.logSecurityEvent({
        type: 'file_access',
        severity: 'high',
        source: 'SecureFileHandler',
        description: `File quarantined: ${reason}`,
        metadata: {
          fileId,
          originalName: metadata.originalName,
          reason
        }
      });

      this.emit('fileQuarantined', { metadata, reason });

    } catch (error) {
      console.error('Failed to quarantine file:', error);
    }
  }

  /**
   * Securely delete a file by overwriting with random data
   */
  private async secureDelete(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      // Overwrite with random data 3 times
      for (let i = 0; i < 3; i++) {
        const randomData = generateSecureRandom(fileSize);
        await fs.writeFile(filePath, randomData);
      }

      // Finally delete the file
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Failed to securely delete file:', error);
      // Still try to delete normally
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignore if already deleted
      }
    }
  }

  /**
   * Validate file before storing
   */
  private async validateFile(
    fileBuffer: Buffer,
    originalName: string,
    options: SecureFileOptions
  ): Promise<void> {
    // Check file size
    if (options.maxFileSize && fileBuffer.length > options.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${options.maxFileSize} bytes`);
    }

    // Check MIME type
    if (options.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
      const mimeType = this.detectMimeType(originalName, fileBuffer);
      if (!options.allowedMimeTypes.includes(mimeType)) {
        throw new Error(`File type ${mimeType} is not allowed`);
      }
    }

    // Basic malware detection (simple signature check)
    if (options.quarantineOnSuspicious) {
      const suspiciousSignatures = [
        Buffer.from('MZ'), // PE executable
        Buffer.from('PK'), // ZIP/JAR (could contain malware)
      ];

      for (const signature of suspiciousSignatures) {
        if (fileBuffer.indexOf(signature) === 0) {
          throw new Error('File contains suspicious signature');
        }
      }
    }
  }

  /**
   * Detect MIME type from file name and content
   */
  private detectMimeType(fileName: string, fileBuffer: Buffer): string {
    const extension = path.extname(fileName).toLowerCase();
    
    // Check magic numbers
    if (fileBuffer.length >= 4) {
      const header = fileBuffer.slice(0, 4);
      
      if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
        return 'image/jpeg';
      }
      if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
        return 'image/png';
      }
      if (header.toString('ascii', 0, 4) === 'ftypmp4') {
        return 'video/mp4';
      }
    }

    // Fallback to extension-based detection
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json'
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Generate unique file ID
   */
  private generateFileId(): string {
    return `file_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Log file access
   */
  private logFileAccess(log: FileAccessLog): void {
    this.accessLogs.push(log);
    
    // Keep only last 1000 logs
    if (this.accessLogs.length > 1000) {
      this.accessLogs = this.accessLogs.slice(-1000);
    }
  }

  /**
   * Schedule file cleanup
   */
  private scheduleCleanup(fileId: string, minutes: number): void {
    const timeout = setTimeout(async () => {
      try {
        await this.deleteFile(fileId);
      } catch (error) {
        console.error(`Failed to cleanup file ${fileId}:`, error);
      } finally {
        this.cleanupIntervals.delete(fileId);
      }
    }, minutes * 60000);

    this.cleanupIntervals.set(fileId, timeout);
  }

  /**
   * Start periodic cleanup of expired files
   */
  private startPeriodicCleanup(): void {
    setInterval(async () => {
      const now = new Date();
      const expiredFiles: string[] = [];

      for (const [fileId, metadata] of this.metadata.entries()) {
        if (metadata.expiresAt && metadata.expiresAt < now) {
          expiredFiles.push(fileId);
        }
      }

      for (const fileId of expiredFiles) {
        try {
          await this.deleteFile(fileId);
        } catch (error) {
          console.error(`Failed to cleanup expired file ${fileId}:`, error);
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Get file metadata
   */
  getFileMetadata(fileId: string): SecureFileMetadata | undefined {
    return this.metadata.get(fileId);
  }

  /**
   * List all files
   */
  listFiles(): SecureFileMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Get access logs for a file
   */
  getFileAccessLogs(fileId: string): FileAccessLog[] {
    return this.accessLogs.filter(log => log.fileId === fileId);
  }

  /**
   * Get all access logs
   */
  getAllAccessLogs(): FileAccessLog[] {
    return [...this.accessLogs];
  }

  /**
   * Clean up all files and resources
   */
  async cleanup(): Promise<void> {
    // Clear all cleanup timers
    for (const timeout of this.cleanupIntervals.values()) {
      clearTimeout(timeout);
    }
    this.cleanupIntervals.clear();

    // Delete all files
    const fileIds = Array.from(this.metadata.keys());
    for (const fileId of fileIds) {
      try {
        await this.deleteFile(fileId);
      } catch (error) {
        console.error(`Failed to delete file ${fileId} during cleanup:`, error);
      }
    }
  }
}

// Global secure file handler instance
let secureFileHandler: SecureFileHandler | null = null;

export function getSecureFileHandler(secureDirectory?: string): SecureFileHandler {
  if (!secureFileHandler) {
    secureFileHandler = new SecureFileHandler(secureDirectory);
  }
  return secureFileHandler;
}

export function resetSecureFileHandler(): void {
  secureFileHandler?.cleanup();
  secureFileHandler = null;
}
