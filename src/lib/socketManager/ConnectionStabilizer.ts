/**
 * WhatsApp Connection Stability Manager
 * Week 4 - Developer B Implementation
 */

import { EventEmitter } from 'events';
import { DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { errorHandler, ErrorCategory } from '../errors/ErrorHandler';

export interface ConnectionHealth {
  status: 'healthy' | 'degraded' | 'critical';
  lastCheck: Date;
  uptime: number;
  reconnectCount: number;
  lastDisconnectReason?: string;
  latency: number;
  messagesSent: number;
  messagesReceived: number;
  errorRate: number;
}

export interface ReconnectionStrategy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export interface ConnectionMetrics {
  totalConnections: number;
  successfulConnections: number;
  failedConnections: number;
  averageConnectionTime: number;
  longestUptime: number;
  totalUptime: number;
  reconnectAttempts: number;
  lastConnected?: Date;
  lastDisconnected?: Date;
}

export class ConnectionStabilizer extends EventEmitter {
  private isConnected = false;
  private connectionStartTime?: Date;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private connectionHealth: ConnectionHealth;
  private metrics: ConnectionMetrics;
  private rateLimiter: Map<string, number[]> = new Map();

  private strategy: ReconnectionStrategy = {
    maxAttempts: 10,
    baseDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 1.5,
    jitter: true
  };

  constructor() {
    super();
    
    this.connectionHealth = {
      status: 'critical',
      lastCheck: new Date(),
      uptime: 0,
      reconnectCount: 0,
      latency: 0,
      messagesSent: 0,
      messagesReceived: 0,
      errorRate: 0
    };

    this.metrics = {
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      averageConnectionTime: 0,
      longestUptime: 0,
      totalUptime: 0,
      reconnectAttempts: 0
    };

    this.startHealthMonitoring();
  }

  /**
   * Handle successful connection
   */
  onConnectionOpen(): void {
    this.isConnected = true;
    this.connectionStartTime = new Date();
    this.reconnectAttempts = 0;
    
    // Update metrics
    this.metrics.totalConnections++;
    this.metrics.successfulConnections++;
    this.metrics.lastConnected = new Date();
    
    // Update health
    this.connectionHealth.status = 'healthy';
    this.connectionHealth.reconnectCount = 0;
    
    // Start ping monitoring
    this.startPingMonitoring();
    
    this.emit('connection_stabilized');
    console.log('WhatsApp connection stabilized');
  }

  /**
   * Handle connection close
   */
  onConnectionClose(lastDisconnect?: any): void {
    const wasConnected = this.isConnected;
    this.isConnected = false;
    
    // Calculate uptime if was connected
    if (wasConnected && this.connectionStartTime) {
      const uptime = Date.now() - this.connectionStartTime.getTime();
      this.connectionHealth.uptime = uptime;
      this.metrics.totalUptime += uptime;
      
      if (uptime > this.metrics.longestUptime) {
        this.metrics.longestUptime = uptime;
      }
    }
    
    this.metrics.lastDisconnected = new Date();
    this.stopPingMonitoring();
    
    // Determine disconnect reason
    const disconnectReason = this.getDisconnectReason(lastDisconnect);
    this.connectionHealth.lastDisconnectReason = disconnectReason;
    
    // Update health status
    this.updateHealthStatus();
    
    // Decide if we should reconnect
    if (this.shouldReconnect(lastDisconnect)) {
      this.scheduleReconnect();
    } else {
      this.connectionHealth.status = 'critical';
      this.emit('connection_abandoned', { reason: disconnectReason });
    }
  }

  /**
   * Handle connection error
   */
  onConnectionError(error: Error): void {
    this.metrics.failedConnections++;
    
    const appError = errorHandler.createWhatsAppError(error, {
      component: 'ConnectionStabilizer',
      action: 'connection_error',
      metadata: { 
        reconnectAttempts: this.reconnectAttempts,
        isConnected: this.isConnected
      }
    });

    this.updateErrorRate();
    this.emit('connection_error', appError);
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.reconnectAttempts >= this.strategy.maxAttempts) {
      this.connectionHealth.status = 'critical';
      this.emit('max_reconnect_attempts_reached');
      return;
    }

    const delay = this.calculateReconnectDelay();
    this.reconnectAttempts++;
    this.metrics.reconnectAttempts++;
    this.connectionHealth.reconnectCount++;

    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.strategy.maxAttempts} in ${delay}ms`);

    this.reconnectTimeout = setTimeout(() => {
      this.emit('reconnect_attempt', {
        attempt: this.reconnectAttempts,
        maxAttempts: this.strategy.maxAttempts
      });
    }, delay);
  }

  /**
   * Calculate reconnection delay with exponential backoff
   */
  private calculateReconnectDelay(): number {
    let delay = this.strategy.baseDelay * Math.pow(this.strategy.backoffMultiplier, this.reconnectAttempts - 1);
    delay = Math.min(delay, this.strategy.maxDelay);
    
    if (this.strategy.jitter) {
      // Add ±25% jitter to prevent thundering herd
      const jitterRange = delay * 0.25;
      delay += (Math.random() - 0.5) * 2 * jitterRange;
    }
    
    return Math.max(delay, this.strategy.baseDelay);
  }

  /**
   * Determine if we should attempt reconnection
   */
  private shouldReconnect(lastDisconnect?: any): boolean {
    if (this.reconnectAttempts >= this.strategy.maxAttempts) {
      return false;
    }

    // Don't reconnect if logged out
    const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
    if (reason === DisconnectReason.loggedOut) {
      return false;
    }

    // Do not auto-reconnect if connection was replaced (conflict). Avoid dueling sessions.
    if (reason === DisconnectReason.connectionReplaced) {
      return false;
    }

    // Don't reconnect if banned
    if (reason === DisconnectReason.forbidden) {
      return false;
    }

    return true;
  }

  /**
   * Get human-readable disconnect reason
   */
  private getDisconnectReason(lastDisconnect?: any): string {
    if (!lastDisconnect?.error) return 'Unknown';

    const reason = (lastDisconnect.error as Boom)?.output?.statusCode;
    
    switch (reason) {
      case DisconnectReason.badSession:
        return 'Bad session';
      case DisconnectReason.connectionClosed:
        return 'Connection closed';
      case DisconnectReason.connectionLost:
        return 'Connection lost';
      case DisconnectReason.connectionReplaced:
        return 'Connection replaced';
      case DisconnectReason.loggedOut:
        return 'Logged out';
      case DisconnectReason.forbidden:
        return 'Forbidden/Banned';
      case DisconnectReason.restartRequired:
        return 'Restart required';
      case DisconnectReason.timedOut:
        return 'Timed out';
      default:
        return `Unknown (${reason})`;
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Start ping monitoring for latency
   */
  private startPingMonitoring(): void {
    this.pingInterval = setInterval(() => {
      this.measureLatency();
    }, 60000); // Ping every minute
  }

  /**
   * Stop ping monitoring
   */
  private stopPingMonitoring(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Perform health check
   */
  private performHealthCheck(): void {
    this.connectionHealth.lastCheck = new Date();
    
    if (this.isConnected && this.connectionStartTime) {
      this.connectionHealth.uptime = Date.now() - this.connectionStartTime.getTime();
    }
    
    this.updateHealthStatus();
    this.emit('health_check_completed', this.connectionHealth);
  }

  /**
   * Update health status based on current conditions
   */
  private updateHealthStatus(): void {
    if (!this.isConnected) {
      this.connectionHealth.status = 'critical';
    } else if (this.connectionHealth.errorRate > 10) {
      this.connectionHealth.status = 'degraded';
    } else if (this.connectionHealth.latency > 5000) {
      this.connectionHealth.status = 'degraded';
    } else {
      this.connectionHealth.status = 'healthy';
    }
  }

  /**
   * Measure connection latency
   */
  private async measureLatency(): Promise<void> {
    if (!this.isConnected) return;

    const startTime = Date.now();
    
    try {
      // This would ping the WhatsApp servers
      // For now, we'll simulate with a timeout
      await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100));
      
      this.connectionHealth.latency = Date.now() - startTime;
    } catch (error) {
      this.connectionHealth.latency = -1; // Indicate ping failed
    }
  }

  /**
   * Update error rate
   */
  private updateErrorRate(): void {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    
    // Clean old entries
    for (const [key, timestamps] of this.rateLimiter) {
      this.rateLimiter.set(key, timestamps.filter(t => now - t < windowMs));
    }
    
    // Add current error
    const errorKey = 'errors';
    const errors = this.rateLimiter.get(errorKey) || [];
    errors.push(now);
    this.rateLimiter.set(errorKey, errors);
    
    // Calculate error rate (errors per minute)
    this.connectionHealth.errorRate = errors.length;
  }

  /**
   * Check if rate limited
   */
  isRateLimited(action: string, maxPerMinute: number = 60): boolean {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    
    const timestamps = this.rateLimiter.get(action) || [];
    const recentTimestamps = timestamps.filter(t => now - t < windowMs);
    
    return recentTimestamps.length >= maxPerMinute;
  }

  /**
   * Record action for rate limiting
   */
  recordAction(action: string): void {
    const now = Date.now();
    const timestamps = this.rateLimiter.get(action) || [];
    timestamps.push(now);
    this.rateLimiter.set(action, timestamps);
  }

  /**
   * Public API methods
   */
  getConnectionHealth(): ConnectionHealth {
    return { ...this.connectionHealth };
  }

  getMetrics(): ConnectionMetrics {
    // Calculate average connection time
    if (this.metrics.successfulConnections > 0) {
      this.metrics.averageConnectionTime = this.metrics.totalUptime / this.metrics.successfulConnections;
    }
    
    return { ...this.metrics };
  }

  updateStrategy(newStrategy: Partial<ReconnectionStrategy>): void {
    this.strategy = { ...this.strategy, ...newStrategy };
    this.emit('strategy_updated', this.strategy);
  }

  getStrategy(): ReconnectionStrategy {
    return { ...this.strategy };
  }

  reset(): void {
    this.reconnectAttempts = 0;
    this.connectionHealth.reconnectCount = 0;
    this.connectionHealth.errorRate = 0;
    this.rateLimiter.clear();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.emit('stabilizer_reset');
  }

  destroy(): void {
    this.reset();
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.stopPingMonitoring();
    this.removeAllListeners();
  }
}
