import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { hashData, createHMAC } from '../db/crypto';

export interface SecurityEvent {
  id: string;
  type: 'authentication' | 'file_access' | 'encryption' | 'intrusion' | 'configuration';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  source: string;
  description: string;
  metadata?: Record<string, any>;
  userAgent?: string;
  ipAddress?: string;
}

export interface SecurityConfig {
  enableLogging: boolean;
  enableIntrustionDetection: boolean;
  logRetentionDays: number;
  maxFailedAttempts: number;
  lockoutDurationMinutes: number;
  enableFileIntegrityMonitoring: boolean;
  alertOnCriticalEvents: boolean;
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  enableLogging: true,
  enableIntrustionDetection: true,
  logRetentionDays: 30,
  maxFailedAttempts: 5,
  lockoutDurationMinutes: 15,
  enableFileIntegrityMonitoring: true,
  alertOnCriticalEvents: true
};

export class SecurityMonitor extends EventEmitter {
  private config: SecurityConfig;
  private logPath: string;
  private failedAttempts: Map<string, { count: number; lastAttempt: Date }> = new Map();
  private lockedAccounts: Map<string, Date> = new Map();
  private fileHashes: Map<string, string> = new Map();

  constructor(config: SecurityConfig = DEFAULT_SECURITY_CONFIG) {
    super();
    this.config = config;
    this.logPath = path.join(process.cwd(), 'logs', 'security.log');
    this.initializeMonitoring();
  }

  private async initializeMonitoring(): Promise<void> {
    try {
      // Ensure log directory exists
      await fs.mkdir(path.dirname(this.logPath), { recursive: true });
      
      // Start periodic tasks
      if (this.config.enableFileIntegrityMonitoring) {
        this.startFileIntegrityMonitoring();
      }
      
      // Clean up old logs
      this.startLogCleanup();
      
      // Clean up expired lockouts
      setInterval(() => this.cleanupExpiredLockouts(), 60000); // Every minute
    } catch (error) {
      console.error('Failed to initialize security monitoring:', error);
    }
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    if (!this.config.enableLogging) return;

    const securityEvent: SecurityEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date()
    };

    try {
      // Write to log file
      const logEntry = JSON.stringify(securityEvent) + '\n';
      await fs.appendFile(this.logPath, logEntry);

      // Emit event for real-time processing
      this.emit('securityEvent', securityEvent);

      // Handle critical events
      if (securityEvent.severity === 'critical' && this.config.alertOnCriticalEvents) {
        this.emit('criticalEvent', securityEvent);
      }

      // Handle failed authentication attempts
      if (securityEvent.type === 'authentication' && securityEvent.metadata?.success === false) {
        await this.handleFailedAuthentication(securityEvent);
      }

    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Handle failed authentication attempts
   */
  private async handleFailedAuthentication(event: SecurityEvent): Promise<void> {
    const identifier = event.ipAddress || event.source;
    const attempts = this.failedAttempts.get(identifier) || { count: 0, lastAttempt: new Date() };
    
    attempts.count++;
    attempts.lastAttempt = new Date();
    this.failedAttempts.set(identifier, attempts);

    if (attempts.count >= this.config.maxFailedAttempts) {
      // Lock the account/IP
      const lockoutUntil = new Date(Date.now() + this.config.lockoutDurationMinutes * 60000);
      this.lockedAccounts.set(identifier, lockoutUntil);

      // Log the lockout event
      await this.logSecurityEvent({
        type: 'intrusion',
        severity: 'high',
        source: 'SecurityMonitor',
        description: `Account/IP locked due to ${attempts.count} failed attempts`,
        metadata: {
          identifier,
          lockoutUntil: lockoutUntil.toISOString(),
          failedAttempts: attempts.count
        }
      });

      // Reset failed attempts counter
      this.failedAttempts.delete(identifier);
    }
  }

  /**
   * Check if an account/IP is locked
   */
  isLocked(identifier: string): boolean {
    const lockoutUntil = this.lockedAccounts.get(identifier);
    if (!lockoutUntil) return false;

    if (new Date() > lockoutUntil) {
      this.lockedAccounts.delete(identifier);
      return false;
    }

    return true;
  }

  /**
   * Get failed attempts count for an identifier
   */
  getFailedAttempts(identifier: string): number {
    return this.failedAttempts.get(identifier)?.count || 0;
  }

  /**
   * Reset failed attempts for an identifier
   */
  resetFailedAttempts(identifier: string): void {
    this.failedAttempts.delete(identifier);
  }

  /**
   * Start file integrity monitoring
   */
  private startFileIntegrityMonitoring(): void {
    const criticalFiles = [
      'src/lib/db/crypto.ts',
      'src/lib/socketManager/BaileysManager.ts',
      'package.json',
      'prisma/schema.prisma'
    ];

    // Initial hash calculation
    this.updateFileHashes(criticalFiles);

    // Periodic monitoring (every 5 minutes)
    setInterval(async () => {
      await this.checkFileIntegrity(criticalFiles);
    }, 5 * 60 * 1000);
  }

  /**
   * Update file hashes
   */
  private async updateFileHashes(files: string[]): Promise<void> {
    for (const file of files) {
      try {
        const fullPath = path.join(process.cwd(), file);
        const content = await fs.readFile(fullPath, 'utf8');
        const hash = hashData(content);
        this.fileHashes.set(file, hash);
      } catch (error) {
        console.warn(`Could not hash file ${file}:`, error);
      }
    }
  }

  /**
   * Check file integrity
   */
  private async checkFileIntegrity(files: string[]): Promise<void> {
    for (const file of files) {
      try {
        const fullPath = path.join(process.cwd(), file);
        const content = await fs.readFile(fullPath, 'utf8');
        const currentHash = hashData(content);
        const previousHash = this.fileHashes.get(file);

        if (previousHash && currentHash !== previousHash) {
          await this.logSecurityEvent({
            type: 'file_access',
            severity: 'high',
            source: 'FileIntegrityMonitor',
            description: `Critical file modified: ${file}`,
            metadata: {
              file,
              previousHash,
              currentHash,
              modified: true
            }
          });

          // Update hash
          this.fileHashes.set(file, currentHash);
        }
      } catch (error) {
        console.warn(`Could not check integrity for ${file}:`, error);
      }
    }
  }

  /**
   * Start log cleanup process
   */
  private startLogCleanup(): void {
    // Run cleanup daily at 2 AM
    const now = new Date();
    const tomorrow2AM = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 2, 0, 0);
    const msUntil2AM = tomorrow2AM.getTime() - now.getTime();

    setTimeout(() => {
      this.cleanupOldLogs();
      // Then run daily
      setInterval(() => this.cleanupOldLogs(), 24 * 60 * 60 * 1000);
    }, msUntil2AM);
  }

  /**
   * Clean up old log entries
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - this.config.logRetentionDays * 24 * 60 * 60 * 1000);
      
      // Read current log file
      const logContent = await fs.readFile(this.logPath, 'utf8');
      const lines = logContent.split('\n').filter(line => line.trim());
      
      // Filter out old entries
      const recentLines = lines.filter(line => {
        try {
          const event = JSON.parse(line);
          return new Date(event.timestamp) > cutoffDate;
        } catch {
          return false;
        }
      });

      // Write back filtered content
      await fs.writeFile(this.logPath, recentLines.join('\n') + '\n');

      await this.logSecurityEvent({
        type: 'configuration',
        severity: 'low',
        source: 'SecurityMonitor',
        description: `Cleaned up old logs. Removed ${lines.length - recentLines.length} entries`,
        metadata: {
          totalEntries: lines.length,
          removedEntries: lines.length - recentLines.length,
          retainedEntries: recentLines.length
        }
      });

    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }

  /**
   * Clean up expired lockouts
   */
  private cleanupExpiredLockouts(): void {
    const now = new Date();
    for (const [identifier, lockoutUntil] of this.lockedAccounts.entries()) {
      if (now > lockoutUntil) {
        this.lockedAccounts.delete(identifier);
      }
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get security health status
   */
  async getSecurityHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    checks: Array<{
      name: string;
      status: 'pass' | 'fail' | 'warning';
      message: string;
    }>;
  }> {
    const checks = [];
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check log file accessibility
    try {
      await fs.access(this.logPath);
      checks.push({
        name: 'Log File Access',
        status: 'pass' as const,
        message: 'Security log file is accessible'
      });
    } catch {
      checks.push({
        name: 'Log File Access',
        status: 'fail' as const,
        message: 'Cannot access security log file'
      });
      overallStatus = 'critical';
    }

    // Check for recent critical events
    try {
      const recentCriticalEvents = await this.getRecentEvents('critical', 24); // Last 24 hours
      if (recentCriticalEvents.length > 0) {
        checks.push({
          name: 'Critical Events',
          status: 'warning' as const,
          message: `${recentCriticalEvents.length} critical events in last 24 hours`
        });
        if (overallStatus === 'healthy') overallStatus = 'warning';
      } else {
        checks.push({
          name: 'Critical Events',
          status: 'pass' as const,
          message: 'No critical events in last 24 hours'
        });
      }
    } catch {
      checks.push({
        name: 'Critical Events',
        status: 'fail' as const,
        message: 'Cannot check recent critical events'
      });
      overallStatus = 'critical';
    }

    // Check locked accounts
    const lockedCount = this.lockedAccounts.size;
    if (lockedCount > 0) {
      checks.push({
        name: 'Account Lockouts',
        status: 'warning' as const,
        message: `${lockedCount} accounts/IPs currently locked`
      });
      if (overallStatus === 'healthy') overallStatus = 'warning';
    } else {
      checks.push({
        name: 'Account Lockouts',
        status: 'pass' as const,
        message: 'No accounts currently locked'
      });
    }

    return { status: overallStatus, checks };
  }

  /**
   * Get recent security events
   */
  async getRecentEvents(severity?: string, hoursBack: number = 24): Promise<SecurityEvent[]> {
    try {
      const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
      const logContent = await fs.readFile(this.logPath, 'utf8');
      const lines = logContent.split('\n').filter(line => line.trim());

      const events: SecurityEvent[] = [];
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (new Date(event.timestamp) > cutoffTime) {
            if (!severity || event.severity === severity) {
              events.push(event);
            }
          }
        } catch {
          // Skip invalid lines
        }
      }

      return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch {
      return [];
    }
  }

  /**
   * Update security configuration
   */
  updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    this.logSecurityEvent({
      type: 'configuration',
      severity: 'medium',
      source: 'SecurityMonitor',
      description: 'Security configuration updated',
      metadata: { updatedFields: Object.keys(newConfig) }
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }
}

// Global security monitor instance
let securityMonitor: SecurityMonitor | null = null;

export function getSecurityMonitor(config?: SecurityConfig): SecurityMonitor {
  if (!securityMonitor) {
    securityMonitor = new SecurityMonitor(config);
  }
  return securityMonitor;
}

export function resetSecurityMonitor(): void {
  securityMonitor = null;
}
