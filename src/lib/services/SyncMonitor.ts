import { EventEmitter } from 'events';
import { SyncScheduler } from './SyncScheduler';
import { SyncLogRepository } from '../db/syncLog';

export interface AlertConfig {
  enabled: boolean;
  channels: Array<'console' | 'email' | 'webhook'>;
  thresholds: {
    errorRate: number;        // Error rate percentage to trigger alert
    consecutiveFailures: number; // Number of consecutive failures
    responseTime: number;     // Response time in ms
    healthCheckInterval: number; // Health check interval in ms
  };
  webhookUrl?: string;
  emailRecipients?: string[];
}

export interface SyncAlert {
  id: string;
  type: 'error_rate' | 'consecutive_failures' | 'slow_response' | 'system_failure' | 'recovery_success';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: any;
  timestamp: Date;
  acknowledged: boolean;
}

export interface MonitoringMetrics {
  uptime: number;
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  averageResponseTime: number;
  currentErrorRate: number;
  lastSyncAt: Date | null;
  systemHealth: 'healthy' | 'degraded' | 'critical';
  activeAlerts: SyncAlert[];
  recentActivity: Array<{
    timestamp: Date;
    type: string;
    status: 'success' | 'failure';
    duration?: number;
  }>;
}

export class SyncMonitor extends EventEmitter {
  private syncScheduler: SyncScheduler | null = null;
  private config: AlertConfig;
  private alerts: Map<string, SyncAlert> = new Map();
  private metrics: MonitoringMetrics;
  private monitoringStartTime: Date;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private recentActivity: Array<{
    timestamp: Date;
    type: string;
    status: 'success' | 'failure';
    duration?: number;
  }> = [];

  constructor(config: Partial<AlertConfig> = {}) {
    super();
    
    this.config = {
      enabled: true,
      channels: ['console'],
      thresholds: {
        errorRate: 20,           // 20% error rate
        consecutiveFailures: 3,  // 3 consecutive failures
        responseTime: 30000,     // 30 seconds
        healthCheckInterval: 60000 // 1 minute
      },
      ...config
    };

    this.monitoringStartTime = new Date();
    this.metrics = this.initializeMetrics();
    
    if (this.config.enabled) {
      this.startMonitoring();
    }
  }

  /**
   * Initialize monitoring metrics
   */
  private initializeMetrics(): MonitoringMetrics {
    return {
      uptime: 0,
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageResponseTime: 0,
      currentErrorRate: 0,
      lastSyncAt: null,
      systemHealth: 'healthy',
      activeAlerts: [],
      recentActivity: []
    };
  }

  /**
   * Initialize monitor with SyncScheduler
   */
  initialize(syncScheduler: SyncScheduler): void {
    this.syncScheduler = syncScheduler;
    this.setupSyncSchedulerEventListeners();
    this.emit('monitor_initialized');
  }

  /**
   * Setup event listeners for SyncScheduler
   */
  private setupSyncSchedulerEventListeners(): void {
    if (!this.syncScheduler) return;

    // Listen for sync events
    this.syncScheduler.on('sync_execution_started', (data) => {
      this.onSyncStarted(data);
    });

    this.syncScheduler.on('sync_execution_completed', (data) => {
      this.onSyncCompleted(data);
    });

    this.syncScheduler.on('sync_execution_failed', (data) => {
      this.onSyncFailed(data);
    });

    this.syncScheduler.on('sync_health_critical', (data) => {
      this.onHealthCritical(data);
    });

    this.syncScheduler.on('auto_recovery_success', () => {
      this.onRecoverySuccess();
    });

    this.syncScheduler.on('auto_recovery_failed', (error) => {
      this.onRecoveryFailed(error);
    });

    this.syncScheduler.on('sync_system_failure', (data) => {
      this.onSystemFailure(data);
    });
  }

  /**
   * Start monitoring
   */
  private startMonitoring(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.thresholds.healthCheckInterval);

    this.emit('monitoring_started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    this.emit('monitoring_stopped');
  }

  /**
   * Handle sync started event
   */
  private onSyncStarted(data: any): void {
    // Don't add 'started' to activity log since it's not in the allowed status types
    this.updateMetrics();
  }

  /**
   * Handle sync completed event
   */
  private onSyncCompleted(data: any): void {
    this.metrics.totalSyncs++;
    this.metrics.successfulSyncs++;
    this.metrics.lastSyncAt = new Date();
    
    if (data.duration) {
      this.updateAverageResponseTime(data.duration);
    }

    this.addActivity(data.type, 'success', data.duration);
    this.updateMetrics();
    this.checkResponseTimeThreshold(data.duration);
  }

  /**
   * Handle sync failed event
   */
  private onSyncFailed(data: any): void {
    this.metrics.totalSyncs++;
    this.metrics.failedSyncs++;
    
    this.addActivity(data.type, 'failure');
    this.updateMetrics();
    this.checkErrorThresholds();
  }

  /**
   * Handle health critical event
   */
  private onHealthCritical(data: any): void {
    this.createAlert('system_failure', 'critical', 'Sync system health is critical', data);
  }

  /**
   * Handle recovery success event
   */
  private onRecoverySuccess(): void {
    this.createAlert('recovery_success', 'medium', 'Sync system recovery completed successfully', {});
    this.acknowledgeAlertsByType('system_failure');
  }

  /**
   * Handle recovery failed event
   */
  private onRecoveryFailed(error: any): void {
    this.createAlert('system_failure', 'critical', 'Sync system recovery failed', { error });
  }

  /**
   * Handle system failure event
   */
  private onSystemFailure(data: any): void {
    this.createAlert('system_failure', 'critical', 'Sync system failure detected', data);
  }

  /**
   * Add activity to recent activity log
   */
  private addActivity(type: string, status: 'success' | 'failure', duration?: number): void {
    this.recentActivity.unshift({
      timestamp: new Date(),
      type,
      status,
      duration
    });

    // Keep only last 100 activities
    if (this.recentActivity.length > 100) {
      this.recentActivity = this.recentActivity.slice(0, 100);
    }

    this.metrics.recentActivity = this.recentActivity.slice(0, 20); // Keep 20 in metrics
  }

  /**
   * Update average response time
   */
  private updateAverageResponseTime(duration: number): void {
    if (this.metrics.averageResponseTime === 0) {
      this.metrics.averageResponseTime = duration;
    } else {
      // Exponential moving average
      this.metrics.averageResponseTime = (this.metrics.averageResponseTime * 0.8) + (duration * 0.2);
    }
  }

  /**
   * Update monitoring metrics
   */
  private updateMetrics(): void {
    this.metrics.uptime = Date.now() - this.monitoringStartTime.getTime();
    
    if (this.metrics.totalSyncs > 0) {
      this.metrics.currentErrorRate = (this.metrics.failedSyncs / this.metrics.totalSyncs) * 100;
    }

    // Determine system health
    if (this.metrics.currentErrorRate > this.config.thresholds.errorRate) {
      this.metrics.systemHealth = 'critical';
    } else if (this.metrics.currentErrorRate > this.config.thresholds.errorRate / 2) {
      this.metrics.systemHealth = 'degraded';
    } else {
      this.metrics.systemHealth = 'healthy';
    }

    this.metrics.activeAlerts = Array.from(this.alerts.values()).filter(alert => !alert.acknowledged);
  }

  /**
   * Check error rate thresholds
   */
  private checkErrorThresholds(): void {
    // Check consecutive failures
    const recentFailures = this.recentActivity
      .slice(0, this.config.thresholds.consecutiveFailures)
      .filter(activity => activity.status === 'failure');

    if (recentFailures.length >= this.config.thresholds.consecutiveFailures) {
      this.createAlert(
        'consecutive_failures',
        'high',
        `${this.config.thresholds.consecutiveFailures} consecutive sync failures detected`,
        { recentFailures }
      );
    }

    // Check error rate
    if (this.metrics.currentErrorRate > this.config.thresholds.errorRate) {
      this.createAlert(
        'error_rate',
        'high',
        `Error rate (${this.metrics.currentErrorRate.toFixed(1)}%) exceeds threshold (${this.config.thresholds.errorRate}%)`,
        { errorRate: this.metrics.currentErrorRate }
      );
    }
  }

  /**
   * Check response time threshold
   */
  private checkResponseTimeThreshold(duration: number): void {
    if (duration > this.config.thresholds.responseTime) {
      this.createAlert(
        'slow_response',
        'medium',
        `Sync response time (${duration}ms) exceeds threshold (${this.config.thresholds.responseTime}ms)`,
        { duration, threshold: this.config.thresholds.responseTime }
      );
    }
  }

  /**
   * Create alert
   */
  private createAlert(
    type: SyncAlert['type'],
    severity: SyncAlert['severity'],
    message: string,
    details: any
  ): void {
    const alertId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: SyncAlert = {
      id: alertId,
      type,
      severity,
      message,
      details,
      timestamp: new Date(),
      acknowledged: false
    };

    this.alerts.set(alertId, alert);
    this.sendAlert(alert);
    this.emit('alert_created', alert);
  }

  /**
   * Send alert through configured channels
   */
  private async sendAlert(alert: SyncAlert): Promise<void> {
    for (const channel of this.config.channels) {
      try {
        switch (channel) {
          case 'console':
            this.sendConsoleAlert(alert);
            break;
          case 'webhook':
            await this.sendWebhookAlert(alert);
            break;
          case 'email':
            await this.sendEmailAlert(alert);
            break;
        }
      } catch (error) {
        console.error(`Failed to send alert via ${channel}:`, error);
      }
    }
  }

  /**
   * Send console alert
   */
  private sendConsoleAlert(alert: SyncAlert): void {
    const prefix = `[SYNC ALERT - ${alert.severity.toUpperCase()}]`;
    const message = `${prefix} ${alert.message}`;
    
    switch (alert.severity) {
      case 'critical':
        console.error(message, alert.details);
        break;
      case 'high':
        console.warn(message, alert.details);
        break;
      default:
        console.log(message, alert.details);
    }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alert: SyncAlert): Promise<void> {
    if (!this.config.webhookUrl) return;

    const payload = {
      alert: {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        timestamp: alert.timestamp.toISOString()
      },
      metrics: this.metrics,
      system: 'whatsapp-sync-monitor'
    };

    const response = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Send email alert (placeholder - would need email service integration)
   */
  private async sendEmailAlert(alert: SyncAlert): Promise<void> {
    // This would integrate with an email service like SendGrid, AWS SES, etc.
    console.log('Email alert would be sent:', alert);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      this.updateMetrics();
      this.emit('alert_acknowledged', alert);
      return true;
    }
    return false;
  }

  /**
   * Acknowledge alerts by type
   */
  acknowledgeAlertsByType(type: SyncAlert['type']): number {
    let count = 0;
    this.alerts.forEach((alert) => {
      if (alert.type === type && !alert.acknowledged) {
        alert.acknowledged = true;
        count++;
      }
    });
    
    if (count > 0) {
      this.updateMetrics();
      this.emit('alerts_acknowledged', { type, count });
    }
    
    return count;
  }

  /**
   * Clear old alerts
   */
  clearOldAlerts(maxAge: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAge;
    let cleared = 0;

    const idsToDelete: string[] = [];
    this.alerts.forEach((alert, id) => {
      if (alert.timestamp.getTime() < cutoff) {
        idsToDelete.push(id);
      }
    });
    
    idsToDelete.forEach(id => {
      this.alerts.delete(id);
      cleared++;
    });

    if (cleared > 0) {
      this.updateMetrics();
      this.emit('alerts_cleared', { count: cleared });
    }

    return cleared;
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      this.updateMetrics();
      
      // Check if sync scheduler is available and healthy
      if (this.syncScheduler) {
        const schedulerHealth = this.syncScheduler.getHealthMetrics();
        
        if (schedulerHealth.status === 'critical') {
          this.createAlert(
            'system_failure',
            'critical',
            'Sync scheduler health is critical',
            schedulerHealth
          );
        }
      }

      // Clean up old alerts
      this.clearOldAlerts();

      this.emit('health_check_completed', {
        timestamp: new Date(),
        metrics: this.metrics
      });

    } catch (error) {
      console.error('Health check failed:', error);
      this.emit('health_check_failed', error);
    }
  }

  /**
   * Get current monitoring metrics
   */
  getMetrics(): MonitoringMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get all alerts
   */
  getAlerts(includeAcknowledged: boolean = false): SyncAlert[] {
    const alerts = Array.from(this.alerts.values());
    return includeAcknowledged ? alerts : alerts.filter(alert => !alert.acknowledged);
  }

  /**
   * Get alert by ID
   */
  getAlert(alertId: string): SyncAlert | null {
    return this.alerts.get(alertId) || null;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart monitoring with new config
    if (this.config.enabled && !this.healthCheckTimer) {
      this.startMonitoring();
    } else if (!this.config.enabled && this.healthCheckTimer) {
      this.stopMonitoring();
    }

    this.emit('config_updated', this.config);
  }

  /**
   * Get configuration
   */
  getConfig(): AlertConfig {
    return { ...this.config };
  }

  /**
   * Export monitoring data for analysis
   */
  exportData(): {
    metrics: MonitoringMetrics;
    alerts: SyncAlert[];
    config: AlertConfig;
    recentActivity: Array<{
      timestamp: Date;
      type: string;
      status: 'success' | 'failure';
      duration?: number;
    }>;
  } {
    return {
      metrics: this.getMetrics(),
      alerts: this.getAlerts(true),
      config: this.getConfig(),
      recentActivity: [...this.recentActivity]
    };
  }
}