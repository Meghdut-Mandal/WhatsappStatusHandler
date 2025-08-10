/**
 * System Monitoring and Health Checks
 * Week 4 - Developer A Implementation
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export interface SystemMetrics {
  timestamp: Date;
  memory: {
    used: number;
    free: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  disk: {
    used: number;
    free: number;
    total: number;
    percentage: number;
  };
  uptime: number;
  connections: {
    whatsapp: boolean;
    database: boolean;
  };
  performance: {
    responseTime: number;
    throughput: number;
    errorRate: number;
  };
}

export interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  details?: Record<string, unknown>;
  lastCheck: Date;
  responseTime: number;
}

export interface SystemAlert {
  id: string;
  type: 'performance' | 'resource' | 'connection' | 'error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  metrics?: Partial<SystemMetrics>;
  resolved: boolean;
}

export class SystemMonitor extends EventEmitter {
  private static instance: SystemMonitor;
  private metrics: SystemMetrics[] = [];
  private healthChecks: Map<string, HealthCheckResult> = new Map();
  private alerts: SystemAlert[] = [];
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private maxMetricsHistory = 1000;
  private maxAlertsHistory = 500;

  // Thresholds for alerts
  private thresholds = {
    memory: { warning: 80, critical: 95 },
    cpu: { warning: 70, critical: 90 },
    disk: { warning: 85, critical: 95 },
    responseTime: { warning: 1000, critical: 5000 },
    errorRate: { warning: 5, critical: 15 }
  };

  private constructor() {
    super();
  }

  static getInstance(): SystemMonitor {
    if (!SystemMonitor.instance) {
      SystemMonitor.instance = new SystemMonitor();
    }
    return SystemMonitor.instance;
  }

  /**
   * Start system monitoring
   */
  startMonitoring(options: {
    metricsInterval?: number;
    healthCheckInterval?: number;
  } = {}): void {
    if (this.isMonitoring) {
      return;
    }

    const metricsInterval = options.metricsInterval || 30000; // 30 seconds
    const healthCheckInterval = options.healthCheckInterval || 60000; // 1 minute

    this.isMonitoring = true;

    // Start metrics collection
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, metricsInterval);

    // Start health checks
    this.healthCheckInterval = setInterval(() => {
      this.runHealthChecks();
    }, healthCheckInterval);

    // Initial collection
    this.collectMetrics();
    this.runHealthChecks();

    console.log('System monitoring started');
    this.emit('monitoring_started');
  }

  /**
   * Stop system monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    console.log('System monitoring stopped');
    this.emit('monitoring_stopped');
  }

  /**
   * Collect system metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      const startTime = Date.now();

      // Memory metrics
      const memoryUsage = process.memoryUsage();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;

      // CPU metrics
      const cpus = os.cpus();
      const loadAverage = os.loadavg();

      // Disk metrics
      const diskUsage = await this.getDiskUsage();

      // Connection status
      const connections = await this.checkConnections();

      // Performance metrics
      const performance = await this.getPerformanceMetrics();

      const metrics: SystemMetrics = {
        timestamp: new Date(),
        memory: {
          used: usedMemory,
          free: freeMemory,
          total: totalMemory,
          percentage: (usedMemory / totalMemory) * 100
        },
        cpu: {
          usage: this.calculateCpuUsage(cpus),
          loadAverage
        },
        disk: diskUsage,
        uptime: os.uptime(),
        connections,
        performance
      };

      this.addMetrics(metrics);
      this.checkThresholds(metrics);

      this.emit('metrics_collected', metrics);

    } catch (error) {
      console.error('Failed to collect metrics:', error);
      this.createAlert('error', 'high', 'Failed to collect system metrics', { error });
    }
  }

  /**
   * Run health checks
   */
  private async runHealthChecks(): Promise<void> {
    const checks = [
      { name: 'database', check: this.checkDatabaseHealth },
      { name: 'whatsapp', check: this.checkWhatsAppHealth },
      { name: 'filesystem', check: this.checkFilesystemHealth },
      { name: 'memory', check: this.checkMemoryHealth },
      { name: 'disk_space', check: this.checkDiskSpaceHealth }
    ];

    for (const { name, check } of checks) {
      try {
        const startTime = Date.now();
        const result = await check.call(this);
        const responseTime = Date.now() - startTime;

        const healthResult: HealthCheckResult = {
          name,
          status: result.status,
          message: result.message,
          details: result.details,
          lastCheck: new Date(),
          responseTime
        };

        this.healthChecks.set(name, healthResult);
        this.emit('health_check_completed', healthResult);

        if (result.status === 'critical') {
          this.createAlert('connection', 'critical', `Health check failed: ${name}`, result.details);
        }

      } catch (error) {
        const healthResult: HealthCheckResult = {
          name,
          status: 'critical',
          message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          lastCheck: new Date(),
          responseTime: 0
        };

        this.healthChecks.set(name, healthResult);
        this.createAlert('error', 'high', `Health check error: ${name}`, { error });
      }
    }
  }

  /**
   * Health check implementations
   */
  private async checkDatabaseHealth(): Promise<{ status: HealthCheckResult['status']; message: string; details?: any }> {
    try {
      const { SessionService } = await import('../db');
      await SessionService.getAll();
      return { status: 'healthy', message: 'Database connection is healthy' };
    } catch (error) {
      return { 
        status: 'critical', 
        message: 'Database connection failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  private async checkWhatsAppHealth(): Promise<{ status: HealthCheckResult['status']; message: string; details?: any }> {
    try {
      const { getBaileysManager } = await import('../socketManager');
      const manager = getBaileysManager();
      const status = manager.getConnectionStatus();
      
      if (status.status === 'connected') {
        return { status: 'healthy', message: 'WhatsApp connection is active' };
      } else if (status.status === 'connecting' || status.status === 'qr_required') {
        return { status: 'warning', message: 'WhatsApp connection in progress' };
      } else {
        return { status: 'critical', message: 'WhatsApp connection failed', details: status };
      }
    } catch (error) {
      return { 
        status: 'critical', 
        message: 'WhatsApp health check failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  private async checkFilesystemHealth(): Promise<{ status: HealthCheckResult['status']; message: string; details?: any }> {
    try {
      const tempDir = path.join(process.cwd(), 'tmp');
      const dataDir = path.join(process.cwd(), 'data');

      // Check if directories exist and are writable
      await fs.access(tempDir, fs.constants.W_OK);
      await fs.access(dataDir, fs.constants.W_OK);

      // Test write operation
      const testFile = path.join(tempDir, 'health_check.tmp');
      await fs.writeFile(testFile, 'health_check');
      await fs.unlink(testFile);

      return { status: 'healthy', message: 'Filesystem is accessible and writable' };
    } catch (error) {
      return { 
        status: 'critical', 
        message: 'Filesystem access failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  private async checkMemoryHealth(): Promise<{ status: HealthCheckResult['status']; message: string; details?: any }> {
    const usage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const usedPercentage = (usage.heapUsed / totalMemory) * 100;

    if (usedPercentage > this.thresholds.memory.critical) {
      return { status: 'critical', message: 'Critical memory usage', details: { usage, percentage: usedPercentage } };
    } else if (usedPercentage > this.thresholds.memory.warning) {
      return { status: 'warning', message: 'High memory usage', details: { usage, percentage: usedPercentage } };
    } else {
      return { status: 'healthy', message: 'Memory usage is normal', details: { usage, percentage: usedPercentage } };
    }
  }

  private async checkDiskSpaceHealth(): Promise<{ status: HealthCheckResult['status']; message: string; details?: any }> {
    try {
      const diskUsage = await this.getDiskUsage();
      
      if (diskUsage.percentage > this.thresholds.disk.critical) {
        return { status: 'critical', message: 'Critical disk space usage', details: diskUsage };
      } else if (diskUsage.percentage > this.thresholds.disk.warning) {
        return { status: 'warning', message: 'High disk space usage', details: diskUsage };
      } else {
        return { status: 'healthy', message: 'Disk space usage is normal', details: diskUsage };
      }
    } catch (error) {
      return { 
        status: 'critical', 
        message: 'Failed to check disk space',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Helper methods
   */
  private async getDiskUsage(): Promise<{ used: number; free: number; total: number; percentage: number }> {
    try {
      const stats = await fs.stat(process.cwd());
      // This is a simplified implementation - in production you'd use a library like 'diskusage'
      const total = 1024 * 1024 * 1024 * 100; // Assume 100GB for demo
      const free = 1024 * 1024 * 1024 * 50; // Assume 50GB free for demo
      const used = total - free;
      
      return {
        used,
        free,
        total,
        percentage: (used / total) * 100
      };
    } catch (error) {
      throw new Error('Failed to get disk usage');
    }
  }

  private async checkConnections(): Promise<{ whatsapp: boolean; database: boolean }> {
    try {
      // Check WhatsApp connection
      const { getBaileysManager } = await import('../socketManager');
      const manager = getBaileysManager();
      const whatsappStatus = manager.getConnectionStatus();
      
      // Check database connection
      const { SessionService } = await import('../db');
      await SessionService.getAll();
      
      return {
        whatsapp: whatsappStatus.status === 'connected',
        database: true
      };
    } catch (error) {
      return {
        whatsapp: false,
        database: false
      };
    }
  }

  private async getPerformanceMetrics(): Promise<{ responseTime: number; throughput: number; errorRate: number }> {
    // This would integrate with actual performance tracking
    // For now, return mock data
    return {
      responseTime: Math.random() * 500 + 100,
      throughput: Math.random() * 100 + 50,
      errorRate: Math.random() * 2
    };
  }

  private calculateCpuUsage(cpus: os.CpuInfo[]): number {
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    return 100 - (totalIdle / totalTick * 100);
  }

  private checkThresholds(metrics: SystemMetrics): void {
    // Memory threshold check
    if (metrics.memory.percentage > this.thresholds.memory.critical) {
      this.createAlert('resource', 'critical', 'Critical memory usage detected', { memory: metrics.memory });
    } else if (metrics.memory.percentage > this.thresholds.memory.warning) {
      this.createAlert('resource', 'medium', 'High memory usage detected', { memory: metrics.memory });
    }

    // CPU threshold check
    if (metrics.cpu.usage > this.thresholds.cpu.critical) {
      this.createAlert('resource', 'critical', 'Critical CPU usage detected', { cpu: metrics.cpu });
    } else if (metrics.cpu.usage > this.thresholds.cpu.warning) {
      this.createAlert('resource', 'medium', 'High CPU usage detected', { cpu: metrics.cpu });
    }

    // Disk threshold check
    if (metrics.disk.percentage > this.thresholds.disk.critical) {
      this.createAlert('resource', 'critical', 'Critical disk usage detected', { disk: metrics.disk });
    } else if (metrics.disk.percentage > this.thresholds.disk.warning) {
      this.createAlert('resource', 'medium', 'High disk usage detected', { disk: metrics.disk });
    }

    // Performance threshold check
    if (metrics.performance.responseTime > this.thresholds.responseTime.critical) {
      this.createAlert('performance', 'critical', 'Critical response time detected', { performance: metrics.performance });
    } else if (metrics.performance.responseTime > this.thresholds.responseTime.warning) {
      this.createAlert('performance', 'medium', 'High response time detected', { performance: metrics.performance });
    }

    if (metrics.performance.errorRate > this.thresholds.errorRate.critical) {
      this.createAlert('performance', 'critical', 'Critical error rate detected', { performance: metrics.performance });
    } else if (metrics.performance.errorRate > this.thresholds.errorRate.warning) {
      this.createAlert('performance', 'medium', 'High error rate detected', { performance: metrics.performance });
    }
  }

  private createAlert(type: SystemAlert['type'], severity: SystemAlert['severity'], message: string, metrics?: any): void {
    const alert: SystemAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      message,
      timestamp: new Date(),
      metrics,
      resolved: false
    };

    this.alerts.push(alert);
    
    // Trim alerts history
    if (this.alerts.length > this.maxAlertsHistory) {
      this.alerts = this.alerts.slice(-this.maxAlertsHistory);
    }

    this.emit('alert_created', alert);
    console.warn(`System Alert [${severity.toUpperCase()}]: ${message}`);
  }

  private addMetrics(metrics: SystemMetrics): void {
    this.metrics.push(metrics);
    
    // Trim metrics history
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * Public API methods
   */
  getCurrentMetrics(): SystemMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  getMetricsHistory(limit?: number): SystemMetrics[] {
    return limit ? this.metrics.slice(-limit) : this.metrics;
  }

  getHealthChecks(): HealthCheckResult[] {
    return Array.from(this.healthChecks.values());
  }

  getHealthCheck(name: string): HealthCheckResult | undefined {
    return this.healthChecks.get(name);
  }

  getAlerts(includeResolved: boolean = false): SystemAlert[] {
    return includeResolved ? this.alerts : this.alerts.filter(alert => !alert.resolved);
  }

  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alert_resolved', alert);
      return true;
    }
    return false;
  }

  clearResolvedAlerts(): void {
    this.alerts = this.alerts.filter(alert => !alert.resolved);
    this.emit('alerts_cleared');
  }

  getSystemHealth(): { overall: 'healthy' | 'warning' | 'critical'; checks: HealthCheckResult[] } {
    const checks = this.getHealthChecks();
    let overall: 'healthy' | 'warning' | 'critical' = 'healthy';

    for (const check of checks) {
      if (check.status === 'critical') {
        overall = 'critical';
        break;
      } else if (check.status === 'warning' && overall === 'healthy') {
        overall = 'warning';
      }
    }

    return { overall, checks };
  }

  updateThresholds(newThresholds: Partial<typeof this.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    this.emit('thresholds_updated', this.thresholds);
  }
}

// Export singleton instance
export const systemMonitor = SystemMonitor.getInstance();
