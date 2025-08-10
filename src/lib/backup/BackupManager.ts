/**
 * Database Backup and Restore Manager
 * Week 4 - Developer A Implementation
 */

import { promises as fs } from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { SessionService, SendHistoryService, MediaMetaService } from '../db';
import { EventEmitter } from 'events';

export interface BackupOptions {
  includeSettings: boolean;
  includeSessions: boolean;
  includeSendHistory: boolean;
  includeMediaMeta: boolean;
  includeFiles: boolean;
  compression: boolean;
  encryption?: {
    enabled: boolean;
    password?: string;
  };
}

export interface BackupInfo {
  id: string;
  timestamp: Date;
  size: number;
  filename: string;
  options: BackupOptions;
  checksum: string;
  version: string;
}

export interface RestoreResult {
  success: boolean;
  restored: {
    settings: boolean;
    sessions: number;
    sendHistory: number;
    mediaMeta: number;
    files: number;
  };
  errors: string[];
  warnings: string[];
}

export class BackupManager extends EventEmitter {
  private static instance: BackupManager;
  private backupDir: string;
  private defaultOptions: BackupOptions = {
    includeSettings: true,
    includeSessions: true,
    includeSendHistory: true,
    includeMediaMeta: true,
    includeFiles: false, // Files can be large
    compression: true,
    encryption: { enabled: false }
  };

  private constructor() {
    super();
    this.backupDir = path.join(process.cwd(), 'data', 'backups');
    this.ensureBackupDir();
  }

  static getInstance(): BackupManager {
    if (!BackupManager.instance) {
      BackupManager.instance = new BackupManager();
    }
    return BackupManager.instance;
  }

  /**
   * Ensure backup directory exists
   */
  private async ensureBackupDir(): Promise<void> {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create backup directory:', error);
    }
  }

  /**
   * Create a backup
   */
  async createBackup(options: Partial<BackupOptions> = {}): Promise<BackupInfo> {
    const backupOptions = { ...this.defaultOptions, ...options };
    const backupId = this.generateBackupId();
    const timestamp = new Date();
    
    try {
      this.emit('backup_started', { id: backupId, timestamp });

      // Create backup data structure
      const backupData: any = {
        metadata: {
          id: backupId,
          timestamp: timestamp.toISOString(),
          version: '1.0',
          options: backupOptions,
          application: 'WhatsApp Status Handler'
        }
      };

      // Backup settings
      if (backupOptions.includeSettings) {
        backupData.settings = await this.backupSettings();
        this.emit('backup_progress', { stage: 'settings', progress: 20 });
      }

      // Backup sessions
      if (backupOptions.includeSessions) {
        backupData.sessions = await this.backupSessions();
        this.emit('backup_progress', { stage: 'sessions', progress: 40 });
      }

      // Backup send history
      if (backupOptions.includeSendHistory) {
        backupData.sendHistory = await this.backupSendHistory();
        this.emit('backup_progress', { stage: 'sendHistory', progress: 60 });
      }

      // Backup media metadata
      if (backupOptions.includeMediaMeta) {
        backupData.mediaMeta = await this.backupMediaMeta();
        this.emit('backup_progress', { stage: 'mediaMeta', progress: 80 });
      }

      // Create backup file
      const filename = `backup_${backupId}_${timestamp.toISOString().split('T')[0]}.${backupOptions.compression ? 'zip' : 'json'}`;
      const filepath = path.join(this.backupDir, filename);

      let finalData: Buffer | string;
      let size: number;

      if (backupOptions.compression) {
        // Create ZIP archive
        const zip = new JSZip();
        zip.file('backup.json', JSON.stringify(backupData, null, 2));

        // Include files if requested
        if (backupOptions.includeFiles) {
          await this.addFilesToZip(zip);
        }

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
        finalData = zipBuffer;
        size = zipBuffer.length;
      } else {
        // Plain JSON
        finalData = JSON.stringify(backupData, null, 2);
        size = Buffer.byteLength(finalData, 'utf8');
      }

      // Encrypt if requested
      if (backupOptions.encryption?.enabled && backupOptions.encryption.password) {
        finalData = await this.encryptData(finalData, backupOptions.encryption.password);
        size = Buffer.byteLength(finalData as Buffer);
      }

      // Write backup file
      await fs.writeFile(filepath, finalData);

      // Calculate checksum
      const checksum = await this.calculateChecksum(filepath);

      const backupInfo: BackupInfo = {
        id: backupId,
        timestamp,
        size,
        filename,
        options: backupOptions,
        checksum,
        version: '1.0'
      };

      // Save backup info
      await this.saveBackupInfo(backupInfo);

      this.emit('backup_completed', backupInfo);
      return backupInfo;

    } catch (error) {
      this.emit('backup_failed', { id: backupId, error });
      throw error;
    }
  }

  /**
   * Restore from backup
   */
  async restoreBackup(backupPath: string, options: {
    overwrite?: boolean;
    selectiveRestore?: Partial<BackupOptions>;
    decryptionPassword?: string;
  } = {}): Promise<RestoreResult> {
    const result: RestoreResult = {
      success: false,
      restored: {
        settings: false,
        sessions: 0,
        sendHistory: 0,
        mediaMeta: 0,
        files: 0
      },
      errors: [],
      warnings: []
    };

    try {
      this.emit('restore_started', { backupPath });

      // Read backup file
      let backupData: any;
      const backupBuffer = await fs.readFile(backupPath);

      // Check if encrypted
      if (options.decryptionPassword) {
        try {
          const decryptedData = await this.decryptData(backupBuffer, options.decryptionPassword);
          backupData = JSON.parse(decryptedData.toString());
        } catch (error) {
          result.errors.push('Failed to decrypt backup file');
          return result;
        }
      } else if (backupPath.endsWith('.zip')) {
        // Handle ZIP archive
        const zip = new JSZip();
        const zipData = await zip.loadAsync(backupBuffer);
        const backupFile = zipData.file('backup.json');
        
        if (!backupFile) {
          result.errors.push('Invalid backup archive - backup.json not found');
          return result;
        }

        const backupContent = await backupFile.async('text');
        backupData = JSON.parse(backupContent);
      } else {
        // Plain JSON
        backupData = JSON.parse(backupBuffer.toString());
      }

      // Validate backup structure
      if (!backupData.metadata || !backupData.metadata.version) {
        result.errors.push('Invalid backup file format');
        return result;
      }

      const restoreOptions = options.selectiveRestore || backupData.metadata.options;

      // Restore settings
      if (restoreOptions.includeSettings && backupData.settings) {
        try {
          await this.restoreSettings(backupData.settings, options.overwrite);
          result.restored.settings = true;
          this.emit('restore_progress', { stage: 'settings', progress: 20 });
        } catch (error) {
          result.errors.push(`Failed to restore settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Restore sessions
      if (restoreOptions.includeSessions && backupData.sessions) {
        try {
          const restored = await this.restoreSessions(backupData.sessions, options.overwrite);
          result.restored.sessions = restored;
          this.emit('restore_progress', { stage: 'sessions', progress: 40 });
        } catch (error) {
          result.errors.push(`Failed to restore sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Restore send history
      if (restoreOptions.includeSendHistory && backupData.sendHistory) {
        try {
          const restored = await this.restoreSendHistory(backupData.sendHistory, options.overwrite);
          result.restored.sendHistory = restored;
          this.emit('restore_progress', { stage: 'sendHistory', progress: 60 });
        } catch (error) {
          result.errors.push(`Failed to restore send history: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Restore media metadata
      if (restoreOptions.includeMediaMeta && backupData.mediaMeta) {
        try {
          const restored = await this.restoreMediaMeta(backupData.mediaMeta, options.overwrite);
          result.restored.mediaMeta = restored;
          this.emit('restore_progress', { stage: 'mediaMeta', progress: 80 });
        } catch (error) {
          result.errors.push(`Failed to restore media metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      result.success = result.errors.length === 0;
      this.emit('restore_completed', result);
      
      return result;

    } catch (error) {
      result.errors.push(`Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.emit('restore_failed', { backupPath, error });
      return result;
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<BackupInfo[]> {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups: BackupInfo[] = [];

      for (const file of files) {
        if (file.endsWith('.json') || file.endsWith('.zip')) {
          try {
            const infoPath = path.join(this.backupDir, file.replace(/\.(json|zip)$/, '.info.json'));
            const infoData = await fs.readFile(infoPath, 'utf8');
            const backupInfo = JSON.parse(infoData) as BackupInfo;
            backups.push(backupInfo);
          } catch (error) {
            // If info file doesn't exist, try to extract info from filename
            const match = file.match(/backup_(.+)_(\d{4}-\d{2}-\d{2})/);
            if (match) {
              const stats = await fs.stat(path.join(this.backupDir, file));
              backups.push({
                id: match[1],
                timestamp: new Date(match[2]),
                size: stats.size,
                filename: file,
                options: this.defaultOptions,
                checksum: '',
                version: 'unknown'
              });
            }
          }
        }
      }

      return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      console.error('Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Delete backup
   */
  async deleteBackup(backupId: string): Promise<boolean> {
    try {
      const backups = await this.listBackups();
      const backup = backups.find(b => b.id === backupId);
      
      if (!backup) {
        return false;
      }

      const backupPath = path.join(this.backupDir, backup.filename);
      const infoPath = path.join(this.backupDir, backup.filename.replace(/\.(json|zip)$/, '.info.json'));

      await fs.unlink(backupPath);
      
      try {
        await fs.unlink(infoPath);
      } catch (error) {
        // Info file might not exist
      }

      this.emit('backup_deleted', { id: backupId });
      return true;
    } catch (error) {
      console.error('Failed to delete backup:', error);
      return false;
    }
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(backupPath: string): Promise<{ valid: boolean; errors: string[] }> {
    const result = { valid: true, errors: [] as string[] };

    try {
      // Check if file exists
      await fs.access(backupPath);

      // Calculate current checksum
      const currentChecksum = await this.calculateChecksum(backupPath);

      // Try to load backup info
      const infoPath = backupPath.replace(/\.(json|zip)$/, '.info.json');
      try {
        const infoData = await fs.readFile(infoPath, 'utf8');
        const backupInfo = JSON.parse(infoData) as BackupInfo;
        
        if (backupInfo.checksum && backupInfo.checksum !== currentChecksum) {
          result.valid = false;
          result.errors.push('Checksum mismatch - backup file may be corrupted');
        }
      } catch (error) {
        result.errors.push('Backup info file not found or invalid');
      }

      // Try to parse backup content
      const backupBuffer = await fs.readFile(backupPath);
      
      if (backupPath.endsWith('.zip')) {
        const zip = new JSZip();
        const zipData = await zip.loadAsync(backupBuffer);
        const backupFile = zipData.file('backup.json');
        
        if (!backupFile) {
          result.valid = false;
          result.errors.push('Invalid backup archive structure');
        } else {
          const backupContent = await backupFile.async('text');
          JSON.parse(backupContent); // Validate JSON
        }
      } else {
        JSON.parse(backupBuffer.toString()); // Validate JSON
      }

    } catch (error) {
      result.valid = false;
      result.errors.push(`Backup verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Schedule automatic backups
   */
  scheduleBackups(options: {
    interval: number; // in milliseconds
    maxBackups?: number;
    backupOptions?: Partial<BackupOptions>;
  }): NodeJS.Timeout {
    const interval = setInterval(async () => {
      try {
        await this.createBackup(options.backupOptions);
        
        // Clean up old backups if maxBackups is set
        if (options.maxBackups) {
          await this.cleanupOldBackups(options.maxBackups);
        }
      } catch (error) {
        console.error('Scheduled backup failed:', error);
        this.emit('scheduled_backup_failed', error);
      }
    }, options.interval);

    this.emit('backup_scheduled', { interval: options.interval, maxBackups: options.maxBackups });
    return interval;
  }

  /**
   * Private helper methods
   */
  private generateBackupId(): string {
    return `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async backupSettings(): Promise<any> {
    try {
      const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
      const settingsData = await fs.readFile(settingsPath, 'utf8');
      return JSON.parse(settingsData);
    } catch (error) {
      return null;
    }
  }

  private async backupSessions(): Promise<any[]> {
    const sessions = await SessionService.getAll();
    return sessions.map(session => ({
      id: session.id,
      deviceName: session.deviceName,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      isActive: session.isActive
      // Note: Don't backup authBlob for security
    }));
  }

  private async backupSendHistory(): Promise<any[]> {
    const sessions = await SessionService.getAll();
    const allHistory: any[] = [];

    for (const session of sessions) {
      const history = await SendHistoryService.getBySessionId(session.id, { limit: 10000 });
      allHistory.push(...history.map(item => ({
        id: item.id,
        sessionId: item.sessionId,
        targetType: item.targetType,
        targetIdentifier: item.targetIdentifier,
        files: item.files,
        status: item.status,
        createdAt: item.createdAt,
        completedAt: item.completedAt,
        // messageId: item.messageId // Not available in current schema
      })));
    }

    return allHistory;
  }

  private async backupMediaMeta(): Promise<any[]> {
    const mediaMeta = await MediaMetaService.getAll();
    return mediaMeta.map(meta => ({
      id: meta.id,
      filename: meta.filename,
      mimetype: meta.mimetype,
      sizeBytes: meta.sizeBytes,
      sha256: meta.sha256,
      tmpCreatedAt: meta.tmpCreatedAt
      // Note: Don't backup storagePath as it may be system-specific
    }));
  }

  private async addFilesToZip(zip: JSZip): Promise<void> {
    try {
      const tempDir = path.join(process.cwd(), 'tmp');
      const files = await fs.readdir(tempDir, { recursive: true });
      
      for (const file of files) {
        const filePath = path.join(tempDir, file as string);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile() && stats.size < 100 * 1024 * 1024) { // Skip files > 100MB
          const fileData = await fs.readFile(filePath);
          zip.file(`files/${file}`, fileData);
        }
      }
    } catch (error) {
      console.warn('Failed to add files to backup:', error);
    }
  }

  private async restoreSettings(settings: any, overwrite: boolean = false): Promise<void> {
    const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
    
    if (!overwrite) {
      try {
        await fs.access(settingsPath);
        throw new Error('Settings file already exists and overwrite is disabled');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }

    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
  }

  private async restoreSessions(sessions: any[], overwrite: boolean = false): Promise<number> {
    let restored = 0;
    
    for (const sessionData of sessions) {
      try {
        const existing = await SessionService.getById(sessionData.id);
        
        if (existing && !overwrite) {
          continue;
        }

        if (existing && overwrite) {
          await SessionService.update(sessionData.id, {
            deviceName: sessionData.deviceName + ' (Restored)',
            lastSeenAt: new Date(),
            isActive: false
          });
        } else {
          await SessionService.create({
            deviceName: sessionData.deviceName + ' (Restored)',
            authBlob: undefined
          });
        }
        
        restored++;
      } catch (error) {
        console.warn(`Failed to restore session ${sessionData.deviceName}:`, error);
      }
    }

    return restored;
  }

  private async restoreSendHistory(history: any[], overwrite: boolean = false): Promise<number> {
    let restored = 0;
    
    for (const historyItem of history) {
      try {
        // Get or create session
        let session = await SessionService.getById(historyItem.sessionId);
        if (!session) {
          session = await SessionService.create({
            deviceName: 'Restored Session',
            authBlob: undefined
          });
        }

        await SendHistoryService.create({
          sessionId: session.id,
          targetType: historyItem.targetType,
          targetIdentifier: historyItem.targetIdentifier,
          files: historyItem.files,
          status: historyItem.status,
          // completedAt: historyItem.completedAt ? new Date(historyItem.completedAt) : null // Not supported in create
        });
        
        restored++;
      } catch (error) {
        console.warn('Failed to restore history item:', error);
      }
    }

    return restored;
  }

  private async restoreMediaMeta(mediaMeta: any[], overwrite: boolean = false): Promise<number> {
    let restored = 0;
    
    for (const metaItem of mediaMeta) {
      try {
        await MediaMetaService.create({
          filename: metaItem.filename,
          originalName: metaItem.originalName || metaItem.filename,
          mimetype: metaItem.mimetype,
          sizeBytes: metaItem.sizeBytes,
          storagePath: metaItem.storagePath || '/tmp/placeholder', // Placeholder path
          sha256: metaItem.sha256,
        });
        
        restored++;
      } catch (error) {
        console.warn('Failed to restore media metadata:', error);
      }
    }

    return restored;
  }

  private async encryptData(data: Buffer | string, password: string): Promise<Buffer> {
    // This is a simplified encryption - in production use proper encryption
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(password, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(algorithm, key);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    
    return Buffer.concat([iv, encrypted]);
  }

  private async decryptData(encryptedData: Buffer, password: string): Promise<Buffer> {
    // This is a simplified decryption - in production use proper encryption
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(password, 'salt', 32);
    const iv = encryptedData.slice(0, 16);
    const encrypted = encryptedData.slice(16);
    
    const decipher = crypto.createDecipher(algorithm, key);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    
    return decrypted;
  }

  private async calculateChecksum(filepath: string): Promise<string> {
    const crypto = require('crypto');
    const fileData = await fs.readFile(filepath);
    return crypto.createHash('sha256').update(fileData).digest('hex');
  }

  private async saveBackupInfo(backupInfo: BackupInfo): Promise<void> {
    const infoPath = path.join(this.backupDir, backupInfo.filename.replace(/\.(json|zip)$/, '.info.json'));
    await fs.writeFile(infoPath, JSON.stringify(backupInfo, null, 2));
  }

  private async cleanupOldBackups(maxBackups: number): Promise<void> {
    const backups = await this.listBackups();
    
    if (backups.length > maxBackups) {
      const toDelete = backups.slice(maxBackups);
      
      for (const backup of toDelete) {
        await this.deleteBackup(backup.id);
      }
      
      this.emit('old_backups_cleaned', { deleted: toDelete.length });
    }
  }
}

// Export singleton instance
export const backupManager = BackupManager.getInstance();
