import { EventEmitter } from 'events';
import { ContactManager } from '../socketManager/ContactManager';
import { SyncLogRepository } from '../db/syncLog';

export interface SyncSchedulerConfig {
  // Automatic sync intervals
  initialSyncDelayMs: number;      // Delay after connection before first sync
  periodicSyncIntervalMs: number;  // Interval for periodic background sync
  maxSyncRetries: number;          // Maximum retry attempts for failed syncs
  syncRetryDelayMs: number;        // Delay between retry attempts
  
  // Throttling settings
  minSyncIntervalMs: number;       // Minimum time between syncs
  maxConcurrentSyncs: number;      // Maximum concurrent sync operations
  
  // Health monitoring
  healthCheckIntervalMs: number;   // Interval for sync health checks
  maxFailedSyncs: number;          // Max failed syncs before alerting
}

export interface SyncStatus {
  isRunning: boolean;
  lastSyncAt: Date | null;
  nextScheduledSync: Date | null;
  failedAttempts: number;
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  averageSyncDuration: number;
  lastError: Error | null;
}

export interface SyncHealthMetrics {
  status: 'healthy' | 'degraded' | 'critical';
  uptime: number;
  successRate: number;
  averageResponseTime: number;
  recentErrors: Array<{
    timestamp: Date;
    error: string;
    type: 'contacts' | 'groups' | 'full';
  }>;
  lastHealthCheck: Date;
}

export class SyncScheduler extends EventEmitter {
  private contactManager: ContactManager | null = null;
  private config: SyncSchedulerConfig;
  private status: SyncStatus;
  private healthMetrics: SyncHealthMetrics;
  
  // Timers and intervals
  private periodicSyncTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  
  // Sync tracking
  private activeSyncs = new Set<string>();
  private syncQueue: Array<{ type: 'full' | 'incremental'; priority: number; timestamp: Date }> = [];
  private syncHistory: Array<{ timestamp: Date; duration: number; success: boolean; type: string }> = [];
  
  // Connection state
  private isWhatsAppConnected = false;
  private connectionEstablishedAt: Date | null = null;

  constructor(config: Partial<SyncSchedulerConfig> = {}) {
    super();
    
    this.config = {
      initialSyncDelayMs: 3000,        // 3 seconds after connection
      periodicSyncIntervalMs: 30 * 60 * 1000, // 30 minutes
      maxSyncRetries: 3,
      syncRetryDelayMs: 5000,          // 5 seconds
      minSyncIntervalMs: 60 * 1000,    // 1 minute minimum between syncs
      maxConcurrentSyncs: 1,           // Only one sync at a time
      healthCheckIntervalMs: 5 * 60 * 1000, // 5 minutes
      maxFailedSyncs: 5,
      ...config
    };

    this.status = {
      isRunning: false,
      lastSyncAt: null,
      nextScheduledSync: null,
      failedAttempts: 0,
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageSyncDuration: 0,
      lastError: null
    };

    this.healthMetrics = {
      status: 'healthy',
      uptime: 0,
      successRate: 100,
      averageResponseTime: 0,
      recentErrors: [],
      lastHealthCheck: new Date()
    };

    this.startHealthMonitoring();
  }

  /**
   * Initialize sync scheduler with ContactManager
   */
  initialize(contactManager: ContactManager): void {
    this.contactManager = contactManager;
    this.setupContactManagerEventListeners();
    this.emit('scheduler_initialized');
  }

  /**
   * Setup event listeners for ContactManager events
   */
  private setupContactManagerEventListeners(): void {
    if (!this.contactManager) return;

    // Listen for WhatsApp connection events
    this.contactManager.on('whatsapp_connected', () => {
      this.onWhatsAppConnected();
    });

    this.contactManager.on('whatsapp_disconnected', () => {
      this.onWhatsAppDisconnected();
    });

    // Listen for sync completion events
    this.contactManager.on('sync_completed', (result) => {
      this.onSyncCompleted(result);
    });

    this.contactManager.on('sync_failed', (error) => {
      this.onSyncFailed(error);
    });

    this.contactManager.on('sync_started', (data) => {
      this.onSyncStarted(data);
    });
  }

  /**
   * Handle WhatsApp connection established
   */
  private onWhatsAppConnected(): void {
    console.log('SyncScheduler: WhatsApp connected, scheduling initial sync');
    this.isWhatsAppConnected = true;
    this.connectionEstablishedAt = new Date();
    
    // Schedule initial sync after connection
    this.scheduleInitialSync();
    
    // Start periodic sync
    this.startPeriodicSync();
    
    this.emit('connection_established');
  }

  /**
   * Handle WhatsApp disconnection
   */
  private onWhatsAppDisconnected(): void {
    console.log('SyncScheduler: WhatsApp disconnected, stopping sync operations');
    this.isWhatsAppConnected = false;
    this.connectionEstablishedAt = null;
    
    // Stop all sync operations
    this.stopPeriodicSync();
    this.clearRetryTimer();
    
    // Clear active syncs
    this.activeSyncs.clear();
    this.syncQueue.length = 0;
    
    this.emit('connection_lost');
  }

  /**
   * Schedule initial sync after connection
   */
  private scheduleInitialSync(): void {
    if (!this.isWhatsAppConnected || !this.contactManager) return;

    // Clear any existing timer
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    this.retryTimer = setTimeout(async () => {
      try {
        console.log('SyncScheduler: Executing initial sync after connection');
        await this.executeSyncWithThrottling('full', 'initial');
      } catch (error) {
        console.error('SyncScheduler: Initial sync failed:', error);
        this.scheduleRetry('full', 'initial_retry');
      }
    }, this.config.initialSyncDelayMs);

    this.status.nextScheduledSync = new Date(Date.now() + this.config.initialSyncDelayMs);
    this.emit('initial_sync_scheduled', { scheduledAt: this.status.nextScheduledSync });
  }

  /**
   * Start periodic background sync
   */
  private startPeriodicSync(): void {
    if (this.periodicSyncTimer) {
      clearInterval(this.periodicSyncTimer);
    }

    this.periodicSyncTimer = setInterval(async () => {
      if (!this.isWhatsAppConnected || !this.contactManager) return;

      try {
        console.log('SyncScheduler: Executing periodic background sync');
        await this.executeSyncWithThrottling('incremental', 'periodic');
      } catch (error) {
        console.error('SyncScheduler: Periodic sync failed:', error);
        this.scheduleRetry('incremental', 'periodic_retry');
      }
    }, this.config.periodicSyncIntervalMs);

    this.status.nextScheduledSync = new Date(Date.now() + this.config.periodicSyncIntervalMs);
    this.emit('periodic_sync_started', { 
      intervalMs: this.config.periodicSyncIntervalMs,
      nextSync: this.status.nextScheduledSync 
    });
  }

  /**
   * Stop periodic sync
   */
  private stopPeriodicSync(): void {
    if (this.periodicSyncTimer) {
      clearInterval(this.periodicSyncTimer);
      this.periodicSyncTimer = null;
    }
    
    this.status.nextScheduledSync = null;
    this.emit('periodic_sync_stopped');
  }

  /**
   * Execute sync with throttling and concurrency control
   */
  private async executeSyncWithThrottling(
    type: 'full' | 'incremental', 
    reason: string
  ): Promise<void> {
    if (!this.contactManager || !this.isWhatsAppConnected) {
      throw new Error('ContactManager not available or WhatsApp not connected');
    }

    // Check throttling - minimum interval between syncs
    if (this.status.lastSyncAt) {
      const timeSinceLastSync = Date.now() - this.status.lastSyncAt.getTime();
      if (timeSinceLastSync < this.config.minSyncIntervalMs) {
        console.log(`SyncScheduler: Sync throttled, ${timeSinceLastSync}ms since last sync`);
        this.emit('sync_throttled', { 
          reason: 'min_interval', 
          timeSinceLastSync,
          minInterval: this.config.minSyncIntervalMs 
        });
        return;
      }
    }

    // Check concurrency limit
    if (this.activeSyncs.size >= this.config.maxConcurrentSyncs) {
      console.log('SyncScheduler: Max concurrent syncs reached, queueing sync');
      this.queueSync(type, reason);
      return;
    }

    const syncId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.activeSyncs.add(syncId);

    try {
      this.emit('sync_execution_started', { syncId, type, reason });
      
      const startTime = Date.now();
      let result;

      if (type === 'full') {
        result = await this.contactManager.syncFromWhatsApp(false);
      } else {
        result = await this.contactManager.incrementalSync();
      }

      const duration = Date.now() - startTime;
      this.recordSyncSuccess(type, duration, result);
      
      this.emit('sync_execution_completed', { 
        syncId, 
        type, 
        reason, 
        duration, 
        result 
      });

    } catch (error) {
      this.recordSyncFailure(type, error as Error);
      this.emit('sync_execution_failed', { 
        syncId, 
        type, 
        reason, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    } finally {
      this.activeSyncs.delete(syncId);
      this.processQueuedSyncs();
    }
  }

  /**
   * Queue sync for later execution
   */
  private queueSync(type: 'full' | 'incremental', reason: string): void {
    const priority = type === 'full' ? 1 : 2; // Full sync has higher priority
    
    this.syncQueue.push({
      type,
      priority,
      timestamp: new Date()
    });

    // Sort queue by priority
    this.syncQueue.sort((a, b) => a.priority - b.priority);

    this.emit('sync_queued', { type, reason, queueLength: this.syncQueue.length });
  }

  /**
   * Process queued syncs
   */
  private async processQueuedSyncs(): Promise<void> {
    if (this.syncQueue.length === 0 || this.activeSyncs.size >= this.config.maxConcurrentSyncs) {
      return;
    }

    const queuedSync = this.syncQueue.shift();
    if (queuedSync) {
      try {
        await this.executeSyncWithThrottling(queuedSync.type, 'queued');
      } catch (error) {
        console.error('SyncScheduler: Queued sync failed:', error);
        this.scheduleRetry(queuedSync.type, 'queued_retry');
      }
    }
  }

  /**
   * Schedule retry for failed sync
   */
  private scheduleRetry(type: 'full' | 'incremental', reason: string): void {
    if (this.status.failedAttempts >= this.config.maxSyncRetries) {
      console.error('SyncScheduler: Max retry attempts reached, giving up');
      this.emit('sync_retry_exhausted', { 
        type, 
        reason, 
        failedAttempts: this.status.failedAttempts 
      });
      return;
    }

    const retryDelay = this.config.syncRetryDelayMs * Math.pow(2, this.status.failedAttempts); // Exponential backoff
    
    this.retryTimer = setTimeout(async () => {
      try {
        console.log(`SyncScheduler: Retrying sync (attempt ${this.status.failedAttempts + 1})`);
        await this.executeSyncWithThrottling(type, reason);
      } catch (error) {
        console.error('SyncScheduler: Retry failed:', error);
        this.scheduleRetry(type, reason);
      }
    }, retryDelay);

    this.emit('sync_retry_scheduled', { 
      type, 
      reason, 
      attempt: this.status.failedAttempts + 1,
      retryDelay,
      scheduledAt: new Date(Date.now() + retryDelay)
    });
  }

  /**
   * Clear retry timer
   */
  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Record successful sync
   */
  private recordSyncSuccess(type: 'full' | 'incremental', duration: number, result: any): void {
    this.status.lastSyncAt = new Date();
    this.status.failedAttempts = 0; // Reset failed attempts on success
    this.status.totalSyncs++;
    this.status.successfulSyncs++;
    this.status.lastError = null;

    // Update average duration
    this.syncHistory.push({ 
      timestamp: new Date(), 
      duration, 
      success: true, 
      type 
    });

    // Keep only last 100 sync records
    if (this.syncHistory.length > 100) {
      this.syncHistory = this.syncHistory.slice(-100);
    }

    this.updateAverageSyncDuration();
    this.updateHealthMetrics();

    // Log to database
    const dbType: 'contacts' | 'groups' | 'full' = type === 'incremental' ? 'full' : 'full';
    this.logSyncToDatabase('completed', dbType, duration, null, result);
  }

  /**
   * Record failed sync
   */
  private recordSyncFailure(type: 'full' | 'incremental', error: Error): void {
    this.status.failedAttempts++;
    this.status.totalSyncs++;
    this.status.failedSyncs++;
    this.status.lastError = error;

    // Add to recent errors
    this.healthMetrics.recentErrors.push({
      timestamp: new Date(),
      error: error.message,
      type: type as 'contacts' | 'groups' | 'full'
    });

    // Keep only last 10 errors
    if (this.healthMetrics.recentErrors.length > 10) {
      this.healthMetrics.recentErrors = this.healthMetrics.recentErrors.slice(-10);
    }

    this.updateHealthMetrics();

    // Log to database
    const dbType: 'contacts' | 'groups' | 'full' = type === 'incremental' ? 'full' : 'full';
    this.logSyncToDatabase('failed', dbType, 0, error.message, null);
  }

  /**
   * Update average sync duration
   */
  private updateAverageSyncDuration(): void {
    const successfulSyncs = this.syncHistory.filter(s => s.success);
    if (successfulSyncs.length > 0) {
      const totalDuration = successfulSyncs.reduce((sum, sync) => sum + sync.duration, 0);
      this.status.averageSyncDuration = totalDuration / successfulSyncs.length;
    }
  }

  /**
   * Update health metrics
   */
  private updateHealthMetrics(): void {
    // Calculate success rate
    if (this.status.totalSyncs > 0) {
      this.healthMetrics.successRate = (this.status.successfulSyncs / this.status.totalSyncs) * 100;
    }

    // Calculate average response time
    this.healthMetrics.averageResponseTime = this.status.averageSyncDuration;

    // Determine health status
    const recentFailures = this.healthMetrics.recentErrors.filter(
      error => Date.now() - error.timestamp.getTime() < 30 * 60 * 1000 // Last 30 minutes
    ).length;

    if (recentFailures >= this.config.maxFailedSyncs) {
      this.healthMetrics.status = 'critical';
    } else if (this.healthMetrics.successRate < 80 || recentFailures > 2) {
      this.healthMetrics.status = 'degraded';
    } else {
      this.healthMetrics.status = 'healthy';
    }

    // Calculate uptime
    if (this.connectionEstablishedAt) {
      this.healthMetrics.uptime = Date.now() - this.connectionEstablishedAt.getTime();
    }

    this.healthMetrics.lastHealthCheck = new Date();
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performEnhancedHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Perform health check
   */
  private performHealthCheck(): void {
    this.updateHealthMetrics();
    
    this.emit('health_check_completed', {
      status: this.healthMetrics.status,
      metrics: { ...this.healthMetrics }
    });

    // Emit alerts for critical status
    if (this.healthMetrics.status === 'critical') {
      this.emit('sync_health_critical', {
        recentErrors: this.healthMetrics.recentErrors,
        successRate: this.healthMetrics.successRate,
        failedAttempts: this.status.failedAttempts
      });
    }
  }

  /**
   * Log sync operation to database
   */
  private async logSyncToDatabase(
    status: 'started' | 'completed' | 'failed',
    type: 'contacts' | 'groups' | 'full',
    duration: number,
    errorMessage: string | null,
    result: any
  ): Promise<void> {
    try {
      if (status === 'started') {
        await SyncLogRepository.create({
          type,
          status: 'started'
        });
      } else {
        // Find the most recent started log for this type and update it
        const logs = await SyncLogRepository.findAll({ 
          type, 
          status: 'started',
          limit: 1 
        });
        
        if (logs.length > 0) {
          await SyncLogRepository.update(logs[0].id, {
            status,
            completedAt: new Date(),
            itemsCount: result ? (result.contacts?.total || 0) + (result.groups?.total || 0) : 0,
            errorMessage: errorMessage || undefined
          });
        } else {
          // Create new log if no started log found
          await SyncLogRepository.create({
            type,
            status,
            itemsCount: result ? (result.contacts?.total || 0) + (result.groups?.total || 0) : 0,
            errorMessage: errorMessage || undefined
          });
        }
      }
    } catch (error) {
      console.error('Failed to log sync to database:', error);
    }
  }

  /**
   * Event handlers for ContactManager events
   */
  private onSyncStarted(data: { type: 'contacts' | 'groups' | 'full' }): void {
    this.logSyncToDatabase('started', data.type, 0, null, null);
  }

  private onSyncCompleted(result: any): void {
    // This is handled in executeSyncWithThrottling
  }

  private onSyncFailed(error: Error): void {
    // This is handled in executeSyncWithThrottling
  }

  /**
   * Manual sync trigger
   */
  async triggerManualSync(type: 'full' | 'incremental' = 'full'): Promise<void> {
    if (!this.isWhatsAppConnected) {
      throw new Error('WhatsApp not connected');
    }

    console.log(`SyncScheduler: Manual ${type} sync triggered`);
    await this.executeSyncWithThrottling(type, 'manual');
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Get health metrics
   */
  getHealthMetrics(): SyncHealthMetrics {
    return { ...this.healthMetrics };
  }

  /**
   * Get sync configuration
   */
  getConfig(): SyncSchedulerConfig {
    return { ...this.config };
  }

  /**
   * Update sync configuration
   */
  updateConfig(newConfig: Partial<SyncSchedulerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart periodic sync with new interval if changed
    if (newConfig.periodicSyncIntervalMs && this.periodicSyncTimer) {
      this.stopPeriodicSync();
      this.startPeriodicSync();
    }

    this.emit('config_updated', this.config);
  }

  /**
   * Stop all sync operations and cleanup
   */
  stop(): void {
    console.log('SyncScheduler: Stopping all sync operations');
    
    this.stopPeriodicSync();
    this.clearRetryTimer();
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    this.activeSyncs.clear();
    this.syncQueue.length = 0;
    this.isWhatsAppConnected = false;
    this.connectionEstablishedAt = null;

    this.emit('scheduler_stopped');
  }

  /**
   * Get active sync operations
   */
  getActiveSyncs(): string[] {
    return Array.from(this.activeSyncs);
  }

  /**
   * Get queued sync operations
   */
  getQueuedSyncs(): Array<{ type: 'full' | 'incremental'; priority: number; timestamp: Date }> {
    return [...this.syncQueue];
  }

  /**
   * Clear sync queue
   */
  clearSyncQueue(): void {
    this.syncQueue.length = 0;
    this.emit('sync_queue_cleared');
  }

  /**
   * Force stop all active syncs (emergency stop)
   */
  forceStopAllSyncs(): void {
    console.warn('SyncScheduler: Force stopping all active syncs');
    this.activeSyncs.clear();
    this.syncQueue.length = 0;
    this.clearRetryTimer();
    this.emit('syncs_force_stopped');
  }

  /**
   * Reset error counters and retry state
   */
  resetErrorState(): void {
    console.log('SyncScheduler: Resetting error state');
    this.status.failedAttempts = 0;
    this.status.lastError = null;
    this.clearRetryTimer();
    
    // Clear recent errors from health metrics
    this.healthMetrics.recentErrors = [];
    this.updateHealthMetrics();
    
    this.emit('error_state_reset');
  }

  /**
   * Perform emergency recovery
   */
  async performEmergencyRecovery(): Promise<void> {
    console.warn('SyncScheduler: Performing emergency recovery');
    
    try {
      // Stop all current operations
      this.forceStopAllSyncs();
      
      // Reset error state
      this.resetErrorState();
      
      // Wait a bit before attempting recovery
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // If WhatsApp is connected, try a gentle sync
      if (this.isWhatsAppConnected && this.contactManager) {
        console.log('SyncScheduler: Attempting recovery sync');
        await this.executeSyncWithThrottling('incremental', 'emergency_recovery');
      }
      
      this.emit('emergency_recovery_completed');
      
    } catch (error) {
      console.error('SyncScheduler: Emergency recovery failed:', error);
      this.emit('emergency_recovery_failed', error);
      throw error;
    }
  }

  /**
   * Check if sync system is in critical state
   */
  isCriticalState(): boolean {
    return (
      this.healthMetrics.status === 'critical' ||
      this.status.failedAttempts >= this.config.maxSyncRetries ||
      this.healthMetrics.recentErrors.length >= this.config.maxFailedSyncs
    );
  }

  /**
   * Get detailed error analysis
   */
  getErrorAnalysis(): {
    criticalState: boolean;
    recentErrorRate: number;
    errorPatterns: Array<{ pattern: string; count: number }>;
    recommendations: string[];
  } {
    const now = Date.now();
    const recentErrors = this.healthMetrics.recentErrors.filter(
      error => now - error.timestamp.getTime() < 30 * 60 * 1000 // Last 30 minutes
    );

    // Analyze error patterns
    const errorPatterns = new Map<string, number>();
    recentErrors.forEach(error => {
      // Extract error pattern (first few words)
      const pattern = error.error.split(' ').slice(0, 3).join(' ');
      errorPatterns.set(pattern, (errorPatterns.get(pattern) || 0) + 1);
    });

    const sortedPatterns = Array.from(errorPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([pattern, count]) => ({ pattern, count }));

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (this.isCriticalState()) {
      recommendations.push('System is in critical state - consider emergency recovery');
    }
    
    if (recentErrors.length > 3) {
      recommendations.push('High error rate detected - check WhatsApp connection stability');
    }
    
    if (this.status.failedAttempts > 0) {
      recommendations.push('Recent sync failures - verify WhatsApp permissions and network connectivity');
    }
    
    if (this.activeSyncs.size >= this.config.maxConcurrentSyncs) {
      recommendations.push('Sync queue is full - consider increasing concurrency limits or reducing sync frequency');
    }

    const recentErrorRate = this.status.totalSyncs > 0 
      ? (recentErrors.length / Math.min(this.status.totalSyncs, 10)) * 100 
      : 0;

    return {
      criticalState: this.isCriticalState(),
      recentErrorRate,
      errorPatterns: sortedPatterns,
      recommendations
    };
  }

  /**
   * Auto-recovery mechanism
   */
  private async attemptAutoRecovery(): Promise<void> {
    if (!this.isCriticalState()) return;

    console.log('SyncScheduler: Attempting automatic recovery');
    
    try {
      // Progressive recovery steps
      
      // Step 1: Clear queue and reset errors
      this.clearSyncQueue();
      this.resetErrorState();
      
      // Step 2: Wait for system to stabilize
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Step 3: Try a minimal sync
      if (this.isWhatsAppConnected && this.contactManager) {
        await this.executeSyncWithThrottling('incremental', 'auto_recovery');
      }
      
      console.log('SyncScheduler: Auto-recovery completed successfully');
      this.emit('auto_recovery_success');
      
    } catch (error) {
      console.error('SyncScheduler: Auto-recovery failed:', error);
      this.emit('auto_recovery_failed', error);
      
      // If auto-recovery fails, emit critical alert
      this.emit('sync_system_failure', {
        error,
        recommendations: this.getErrorAnalysis().recommendations
      });
    }
  }

  /**
   * Enhanced health monitoring with auto-recovery
   */
  private performEnhancedHealthCheck(): void {
    this.updateHealthMetrics();
    
    this.emit('health_check_completed', {
      status: this.healthMetrics.status,
      metrics: { ...this.healthMetrics }
    });

    // Check if auto-recovery is needed
    if (this.isCriticalState()) {
      this.emit('sync_health_critical', {
        recentErrors: this.healthMetrics.recentErrors,
        successRate: this.healthMetrics.successRate,
        failedAttempts: this.status.failedAttempts,
        analysis: this.getErrorAnalysis()
      });

      // Attempt auto-recovery if enabled
      if (this.config.maxFailedSyncs > 0) {
        this.attemptAutoRecovery().catch(error => {
          console.error('Auto-recovery attempt failed:', error);
        });
      }
    }
  }

  /**
   * Get comprehensive system status
   */
  getSystemStatus() {
    return {
      status: this.getSyncStatus(),
      health: this.getHealthMetrics(),
      config: this.getConfig(),
      analysis: this.getErrorAnalysis(),
      activeSyncs: this.getActiveSyncs(),
      queuedSyncs: this.getQueuedSyncs()
    };
  }
}