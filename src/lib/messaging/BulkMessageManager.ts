import { EventEmitter } from 'events';
import { getBaileysManager } from '../socketManager';
import { getMessageScheduler, ScheduledMessage } from './MessageScheduler';
import { SendHistoryService } from '../db';
import { getSecurityMonitor } from '../security/SecurityMonitor';

export interface BulkMessageJob {
  id: string;
  name: string;
  description?: string;
  targets: Array<{
    type: 'contact' | 'group';
    identifier: string;
    name?: string;
    customVariables?: Record<string, string>;
  }>;
  content: {
    type: 'text' | 'image' | 'video' | 'document';
    data: Buffer | string;
    caption?: string;
    mimetype?: string;
    filename?: string;
    templateId?: string;
  };
  settings: {
    delayBetweenMessages: number; // seconds
    maxRetries: number;
    scheduleFor?: Date;
    respectOnlineStatus: boolean;
    skipDuplicates: boolean;
  };
  status: 'pending' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
  progress: {
    total: number;
    sent: number;
    failed: number;
    skipped: number;
  };
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  sessionId: string;
  errors: Array<{
    targetId: string;
    error: string;
    timestamp: Date;
  }>;
}

export interface BulkMessageConfig {
  maxConcurrentJobs: number;
  defaultDelayBetweenMessages: number;
  maxTargetsPerJob: number;
  enableProgressTracking: boolean;
  autoCleanupCompletedJobs: boolean;
  cleanupAfterDays: number;
}

export const DEFAULT_BULK_CONFIG: BulkMessageConfig = {
  maxConcurrentJobs: 2,
  defaultDelayBetweenMessages: 5, // 5 seconds
  maxTargetsPerJob: 1000,
  enableProgressTracking: true,
  autoCleanupCompletedJobs: true,
  cleanupAfterDays: 30
};

export class BulkMessageManager extends EventEmitter {
  private jobs: Map<string, BulkMessageJob> = new Map();
  private activeJobs: Set<string> = new Set();
  private config: BulkMessageConfig;
  private processingInterval: NodeJS.Timeout | null = null;
  private securityMonitor = getSecurityMonitor();

  constructor(config: BulkMessageConfig = DEFAULT_BULK_CONFIG) {
    super();
    this.config = config;
    this.startProcessing();
    this.startCleanup();
  }

  /**
   * Create a new bulk message job
   */
  async createBulkJob(
    name: string,
    targets: BulkMessageJob['targets'],
    content: BulkMessageJob['content'],
    settings: Partial<BulkMessageJob['settings']>,
    sessionId: string,
    description?: string
  ): Promise<string> {
    try {
      // Validate targets count
      if (targets.length > this.config.maxTargetsPerJob) {
        throw new Error(`Too many targets. Maximum allowed: ${this.config.maxTargetsPerJob}`);
      }

      if (targets.length === 0) {
        throw new Error('At least one target is required');
      }

      const jobId = this.generateJobId();
      
      const job: BulkMessageJob = {
        id: jobId,
        name,
        description,
        targets: this.deduplicateTargets(targets, settings.skipDuplicates !== false),
        content,
        settings: {
          delayBetweenMessages: settings.delayBetweenMessages || this.config.defaultDelayBetweenMessages,
          maxRetries: settings.maxRetries || 3,
          scheduleFor: settings.scheduleFor,
          respectOnlineStatus: settings.respectOnlineStatus || false,
          skipDuplicates: settings.skipDuplicates !== false
        },
        status: 'pending',
        progress: {
          total: targets.length,
          sent: 0,
          failed: 0,
          skipped: 0
        },
        createdAt: new Date(),
        sessionId,
        errors: []
      };

      this.jobs.set(jobId, job);

      // Log security event
      await this.securityMonitor.logSecurityEvent({
        type: 'configuration',
        severity: 'medium',
        source: 'BulkMessageManager',
        description: `Bulk message job created: ${name}`,
        metadata: {
          jobId,
          targetCount: targets.length,
          contentType: content.type,
          scheduled: !!settings.scheduleFor
        }
      });

      this.emit('jobCreated', job);
      return jobId;

    } catch (error) {
      console.error('Failed to create bulk job:', error);
      throw error;
    }
  }

  /**
   * Start a bulk message job
   */
  async startJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status !== 'pending' && job.status !== 'paused') {
      return false;
    }

    // Check concurrent job limit
    if (this.activeJobs.size >= this.config.maxConcurrentJobs) {
      throw new Error('Maximum concurrent jobs limit reached');
    }

    job.status = 'running';
    job.startedAt = new Date();
    this.jobs.set(jobId, job);
    this.activeJobs.add(jobId);

    await this.securityMonitor.logSecurityEvent({
      type: 'configuration',
      severity: 'low',
      source: 'BulkMessageManager',
      description: `Bulk message job started: ${job.name}`,
      metadata: { jobId, targetCount: job.targets.length }
    });

    this.emit('jobStarted', job);
    
    // Start processing the job
    this.processJob(job);
    return true;
  }

  /**
   * Pause a running job
   */
  async pauseJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running') return false;

    job.status = 'paused';
    this.jobs.set(jobId, job);
    this.activeJobs.delete(jobId);

    this.emit('jobPaused', job);
    return true;
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'running') {
      this.activeJobs.delete(jobId);
    }

    job.status = 'cancelled';
    job.completedAt = new Date();
    this.jobs.set(jobId, job);

    await this.securityMonitor.logSecurityEvent({
      type: 'configuration',
      severity: 'low',
      source: 'BulkMessageManager',
      description: `Bulk message job cancelled: ${job.name}`,
      metadata: { jobId, progress: job.progress }
    });

    this.emit('jobCancelled', job);
    return true;
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): BulkMessageJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * List all jobs with optional filtering
   */
  listJobs(filter?: {
    status?: BulkMessageJob['status'];
    sessionId?: string;
  }): BulkMessageJob[] {
    const jobs = Array.from(this.jobs.values());
    
    if (!filter) return jobs;

    return jobs.filter(job => {
      if (filter.status && job.status !== filter.status) return false;
      if (filter.sessionId && job.sessionId !== filter.sessionId) return false;
      return true;
    });
  }

  /**
   * Process a bulk message job
   */
  private async processJob(job: BulkMessageJob): Promise<void> {
    try {
      const baileysManager = getBaileysManager();
      const messageSender = baileysManager.getMessageSender();
      const scheduler = getMessageScheduler();

      for (let i = 0; i < job.targets.length; i++) {
        // Check if job is still running
        if (job.status !== 'running') {
          break;
        }

        const target = job.targets[i];
        
        try {
          // Check if we should respect online status
          if (job.settings.respectOnlineStatus) {
            // This would require implementing online status checking
            // For now, we'll skip this feature
          }

          // Prepare message content
          let messageContent = job.content;
          
          // If using template, process it with custom variables
          if (job.content.templateId && target.customVariables) {
            const template = scheduler.getTemplate(job.content.templateId);
            if (template) {
              // Process template with custom variables
              let processedTemplate = template.content.template;
              for (const [key, value] of Object.entries(target.customVariables)) {
                processedTemplate = processedTemplate.replace(
                  new RegExp(`\\{\\{${key}\\}\\}`, 'g'), 
                  value
                );
              }
              messageContent = {
                ...job.content,
                data: processedTemplate
              };
            }
          }

          // Send message
          if (job.settings.scheduleFor) {
            // Schedule the message
            await scheduler.scheduleMessage(
              target.type,
              target.identifier,
              {
                type: messageContent.type,
                data: messageContent.data as Buffer,
                caption: messageContent.caption,
                mimetype: messageContent.mimetype,
                filename: messageContent.filename
              },
              job.settings.scheduleFor,
              job.sessionId
            );
          } else {
            // Send immediately
            await messageSender.sendMessage({
              targetType: target.type,
              targetIdentifier: target.identifier,
              files: [{
                buffer: messageContent.data as Buffer,
                mimetype: messageContent.mimetype || 'text/plain',
                filename: messageContent.filename || 'bulk_message'
              }],
              caption: messageContent.caption,
              sendAsDocument: messageContent.type === 'document'
            });
          }

          job.progress.sent++;
          this.updateJobProgress(job);

          // Delay between messages
          if (i < job.targets.length - 1 && job.settings.delayBetweenMessages > 0) {
            await this.delay(job.settings.delayBetweenMessages * 1000);
          }

        } catch (error) {
          console.error(`Failed to send message to ${target.identifier}:`, error);
          
          job.errors.push({
            targetId: target.identifier,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date()
          });

          job.progress.failed++;
          this.updateJobProgress(job);
        }
      }

      // Mark job as completed
      job.status = 'completed';
      job.completedAt = new Date();
      this.jobs.set(job.id, job);
      this.activeJobs.delete(job.id);

      await this.securityMonitor.logSecurityEvent({
        type: 'configuration',
        severity: 'low',
        source: 'BulkMessageManager',
        description: `Bulk message job completed: ${job.name}`,
        metadata: {
          jobId: job.id,
          progress: job.progress,
          duration: job.completedAt.getTime() - (job.startedAt?.getTime() || 0)
        }
      });

      this.emit('jobCompleted', job);

    } catch (error) {
      console.error(`Bulk job ${job.id} failed:`, error);
      
      job.status = 'failed';
      job.completedAt = new Date();
      this.jobs.set(job.id, job);
      this.activeJobs.delete(job.id);

      this.emit('jobFailed', job);
    }
  }

  /**
   * Update job progress and emit event
   */
  private updateJobProgress(job: BulkMessageJob): void {
    this.jobs.set(job.id, job);
    
    if (this.config.enableProgressTracking) {
      this.emit('jobProgress', job);
    }
  }

  /**
   * Deduplicate targets
   */
  private deduplicateTargets(
    targets: BulkMessageJob['targets'], 
    skipDuplicates: boolean
  ): BulkMessageJob['targets'] {
    if (!skipDuplicates) return targets;

    const seen = new Set<string>();
    return targets.filter(target => {
      const key = `${target.type}:${target.identifier}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Start processing jobs
   */
  private startProcessing(): void {
    this.processingInterval = setInterval(async () => {
      await this.checkPendingJobs();
    }, 10000); // Check every 10 seconds
  }

  /**
   * Check for pending jobs to start
   */
  private async checkPendingJobs(): Promise<void> {
    if (this.activeJobs.size >= this.config.maxConcurrentJobs) {
      return;
    }

    const pendingJobs = Array.from(this.jobs.values())
      .filter(job => job.status === 'pending')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const slotsAvailable = this.config.maxConcurrentJobs - this.activeJobs.size;
    const jobsToStart = pendingJobs.slice(0, slotsAvailable);

    for (const job of jobsToStart) {
      try {
        await this.startJob(job.id);
      } catch (error) {
        console.error(`Failed to auto-start job ${job.id}:`, error);
      }
    }
  }

  /**
   * Start cleanup process
   */
  private startCleanup(): void {
    if (!this.config.autoCleanupCompletedJobs) return;

    // Run cleanup daily at 4 AM
    const now = new Date();
    const tomorrow4AM = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 4, 0, 0);
    const msUntil4AM = tomorrow4AM.getTime() - now.getTime();

    setTimeout(() => {
      this.cleanupOldJobs();
      // Then run daily
      setInterval(() => this.cleanupOldJobs(), 24 * 60 * 60 * 1000);
    }, msUntil4AM);
  }

  /**
   * Clean up old completed jobs
   */
  private async cleanupOldJobs(): Promise<void> {
    const cutoffDate = new Date(Date.now() - this.config.cleanupAfterDays * 24 * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (
        (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') &&
        job.createdAt < cutoffDate
      ) {
        this.jobs.delete(jobId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      await this.securityMonitor.logSecurityEvent({
        type: 'configuration',
        severity: 'low',
        source: 'BulkMessageManager',
        description: `Cleaned up ${cleanedCount} old bulk message jobs`,
        metadata: { cleanedCount, cutoffDate: cutoffDate.toISOString() }
      });
    }
  }

  /**
   * Utility function to create delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get manager statistics
   */
  getStatistics(): {
    totalJobs: number;
    activeJobs: number;
    completedJobs: number;
    failedJobs: number;
    totalMessagesSent: number;
    totalMessagesFailed: number;
  } {
    const jobs = Array.from(this.jobs.values());
    
    return {
      totalJobs: jobs.length,
      activeJobs: jobs.filter(j => j.status === 'running').length,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length,
      totalMessagesSent: jobs.reduce((sum, job) => sum + job.progress.sent, 0),
      totalMessagesFailed: jobs.reduce((sum, job) => sum + job.progress.failed, 0)
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<BulkMessageConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Stop manager and cleanup
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Cancel all active jobs
    for (const jobId of this.activeJobs) {
      this.cancelJob(jobId);
    }
  }
}

// Global bulk message manager instance
let bulkMessageManager: BulkMessageManager | null = null;

export function getBulkMessageManager(config?: BulkMessageConfig): BulkMessageManager {
  if (!bulkMessageManager) {
    bulkMessageManager = new BulkMessageManager(config);
  }
  return bulkMessageManager;
}

export function resetBulkMessageManager(): void {
  if (bulkMessageManager) {
    bulkMessageManager.stop();
    bulkMessageManager = null;
  }
}
