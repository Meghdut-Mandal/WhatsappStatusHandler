/**
 * WhatsApp Protocol Compliance and Best Practices
 * Week 4 - Developer B Implementation
 */

import { EventEmitter } from 'events';
import { WASocket, BaileysEventMap, ConnectionState } from '@whiskeysockets/baileys';
import { errorHandler, ErrorCategory } from '../errors/ErrorHandler';

export interface ProtocolMetrics {
  messagesPerMinute: number;
  messagesPerHour: number;
  messagesPerDay: number;
  connectionUptime: number;
  lastActivity: Date;
  protocolVersion: string;
  clientVersion: string;
  rateLimit: {
    current: number;
    limit: number;
    resetTime: Date;
  };
}

export interface ComplianceRule {
  name: string;
  description: string;
  severity: 'warning' | 'error' | 'critical';
  check: (metrics: ProtocolMetrics, socket?: WASocket) => boolean;
  recommendation: string;
}

export interface ComplianceReport {
  timestamp: Date;
  overallStatus: 'compliant' | 'warning' | 'violation';
  violations: {
    rule: ComplianceRule;
    details: string;
  }[];
  metrics: ProtocolMetrics;
  recommendations: string[];
}

export class ProtocolCompliance extends EventEmitter {
  private socket: WASocket | null = null;
  private metrics: ProtocolMetrics;
  private messageHistory: Date[] = [];
  private connectionStartTime?: Date;
  private lastComplianceCheck = new Date();
  private complianceInterval: NodeJS.Timeout | null = null;
  
  // Rate limiting thresholds (based on WhatsApp's known limits)
  private readonly RATE_LIMITS = {
    MESSAGES_PER_MINUTE: 20,
    MESSAGES_PER_HOUR: 1000,
    MESSAGES_PER_DAY: 10000,
    STATUS_UPDATES_PER_DAY: 30,
    GROUP_MESSAGES_PER_HOUR: 100
  };

  // Compliance rules
  private readonly complianceRules: ComplianceRule[] = [
    {
      name: 'message_rate_limit',
      description: 'Messages per minute should not exceed safe limits',
      severity: 'critical',
      check: (metrics) => metrics.messagesPerMinute <= this.RATE_LIMITS.MESSAGES_PER_MINUTE,
      recommendation: 'Reduce message sending frequency to avoid rate limiting'
    },
    {
      name: 'hourly_message_limit',
      description: 'Messages per hour should not exceed safe limits',
      severity: 'error',
      check: (metrics) => metrics.messagesPerHour <= this.RATE_LIMITS.MESSAGES_PER_HOUR,
      recommendation: 'Implement message queuing to spread messages over time'
    },
    {
      name: 'daily_message_limit',
      description: 'Messages per day should not exceed safe limits',
      severity: 'warning',
      check: (metrics) => metrics.messagesPerDay <= this.RATE_LIMITS.MESSAGES_PER_DAY,
      recommendation: 'Consider splitting message sending across multiple days'
    },
    {
      name: 'connection_stability',
      description: 'Connection should be stable and not reconnect frequently',
      severity: 'warning',
      check: (metrics) => metrics.connectionUptime > 300000, // 5 minutes minimum
      recommendation: 'Investigate connection stability issues'
    },
    {
      name: 'client_version',
      description: 'Client should use supported Baileys version',
      severity: 'warning',
      check: (metrics) => this.isVersionSupported(metrics.clientVersion),
      recommendation: 'Update to latest supported Baileys version'
    },
    {
      name: 'activity_pattern',
      description: 'Activity should follow human-like patterns',
      severity: 'warning',
      check: (metrics) => this.checkActivityPattern(metrics),
      recommendation: 'Vary message timing to appear more natural'
    }
  ];

  constructor() {
    super();
    
    this.metrics = {
      messagesPerMinute: 0,
      messagesPerHour: 0,
      messagesPerDay: 0,
      connectionUptime: 0,
      lastActivity: new Date(),
      protocolVersion: 'unknown',
      clientVersion: 'unknown',
      rateLimit: {
        current: 0,
        limit: this.RATE_LIMITS.MESSAGES_PER_MINUTE,
        resetTime: new Date(Date.now() + 60000)
      }
    };

    this.startComplianceMonitoring();
  }

  /**
   * Set WhatsApp socket instance
   */
  setSocket(socket: WASocket | null): void {
    this.socket = socket;
    
    if (socket) {
      this.setupSocketMonitoring();
      this.connectionStartTime = new Date();
    } else {
      this.connectionStartTime = undefined;
    }
  }

  /**
   * Setup socket monitoring for protocol compliance
   */
  private setupSocketMonitoring(): void {
    if (!this.socket) return;

    // Monitor outgoing messages
    this.socket.ev.on('message.upsert', (messageUpsert) => {
      // Track outgoing messages for rate limiting
      for (const message of messageUpsert.messages) {
        if (message.key.fromMe) {
          this.recordMessageSent();
        }
      }
    });

    // Monitor connection state
    this.socket.ev.on('connection.update', (update) => {
      if (update.connection === 'open') {
        this.connectionStartTime = new Date();
      }
    });

    // Extract protocol information
    try {
      const baileys = require('@whiskeysockets/baileys/package.json');
      this.metrics.clientVersion = baileys.version || 'unknown';
      this.metrics.protocolVersion = 'multi-device'; // Baileys uses multi-device protocol
    } catch (error) {
      console.warn('Could not determine Baileys version');
    }
  }

  /**
   * Record a message being sent
   */
  recordMessageSent(): void {
    const now = new Date();
    this.messageHistory.push(now);
    this.metrics.lastActivity = now;
    
    // Clean old messages (keep only last 24 hours)
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    this.messageHistory = this.messageHistory.filter(date => date > dayAgo);
    
    // Update metrics
    this.updateMessageMetrics();
    
    // Check for immediate violations
    this.checkRateLimits();
    
    this.emit('message_sent', { timestamp: now, totalMessages: this.messageHistory.length });
  }

  /**
   * Update message metrics
   */
  private updateMessageMetrics(): void {
    const now = new Date();
    const minuteAgo = new Date(now.getTime() - 60 * 1000);
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    this.metrics.messagesPerMinute = this.messageHistory.filter(date => date > minuteAgo).length;
    this.metrics.messagesPerHour = this.messageHistory.filter(date => date > hourAgo).length;
    this.metrics.messagesPerDay = this.messageHistory.filter(date => date > dayAgo).length;

    // Update connection uptime
    if (this.connectionStartTime) {
      this.metrics.connectionUptime = now.getTime() - this.connectionStartTime.getTime();
    }

    // Update rate limit info
    this.metrics.rateLimit.current = this.metrics.messagesPerMinute;
  }

  /**
   * Check for rate limit violations
   */
  private checkRateLimits(): void {
    if (this.metrics.messagesPerMinute >= this.RATE_LIMITS.MESSAGES_PER_MINUTE * 0.8) {
      this.emit('rate_limit_warning', {
        current: this.metrics.messagesPerMinute,
        limit: this.RATE_LIMITS.MESSAGES_PER_MINUTE,
        type: 'minute'
      });
    }

    if (this.metrics.messagesPerHour >= this.RATE_LIMITS.MESSAGES_PER_HOUR * 0.8) {
      this.emit('rate_limit_warning', {
        current: this.metrics.messagesPerHour,
        limit: this.RATE_LIMITS.MESSAGES_PER_HOUR,
        type: 'hour'
      });
    }

    if (this.metrics.messagesPerDay >= this.RATE_LIMITS.MESSAGES_PER_DAY * 0.8) {
      this.emit('rate_limit_warning', {
        current: this.metrics.messagesPerDay,
        limit: this.RATE_LIMITS.MESSAGES_PER_DAY,
        type: 'day'
      });
    }
  }

  /**
   * Start compliance monitoring
   */
  private startComplianceMonitoring(): void {
    this.complianceInterval = setInterval(() => {
      this.performComplianceCheck();
    }, 60000); // Check every minute
  }

  /**
   * Perform compliance check
   */
  performComplianceCheck(): ComplianceReport {
    this.updateMessageMetrics();
    
    const violations: ComplianceReport['violations'] = [];
    const recommendations: string[] = [];
    
    for (const rule of this.complianceRules) {
      try {
        const isCompliant = rule.check(this.metrics, this.socket || undefined);
        
        if (!isCompliant) {
          violations.push({
            rule,
            details: `Rule '${rule.name}' violated: ${rule.description}`
          });
          recommendations.push(rule.recommendation);
        }
      } catch (error) {
        errorHandler.handleError(error, {
          category: ErrorCategory.WHATSAPP,
          severity: 'low',
          context: { 
            component: 'ProtocolCompliance', 
            action: 'compliance_check',
            rule: rule.name
          }
        });
      }
    }

    // Determine overall status
    let overallStatus: ComplianceReport['overallStatus'] = 'compliant';
    if (violations.some(v => v.rule.severity === 'critical')) {
      overallStatus = 'violation';
    } else if (violations.some(v => v.rule.severity === 'error' || v.rule.severity === 'warning')) {
      overallStatus = 'warning';
    }

    const report: ComplianceReport = {
      timestamp: new Date(),
      overallStatus,
      violations,
      metrics: { ...this.metrics },
      recommendations: [...new Set(recommendations)] // Remove duplicates
    };

    this.lastComplianceCheck = new Date();
    this.emit('compliance_check_completed', report);

    // Log violations
    if (violations.length > 0) {
      console.warn(`Protocol compliance violations detected: ${violations.length}`);
      for (const violation of violations) {
        console.warn(`- ${violation.rule.name}: ${violation.details}`);
      }
    }

    return report;
  }

  /**
   * Check if Baileys version is supported
   */
  private isVersionSupported(version: string): boolean {
    if (version === 'unknown') return false;
    
    // This would check against known supported versions
    // For now, assume any version is supported
    return true;
  }

  /**
   * Check activity pattern for human-like behavior
   */
  private checkActivityPattern(metrics: ProtocolMetrics): boolean {
    // Check if messages are sent too regularly (bot-like behavior)
    if (this.messageHistory.length < 10) return true;
    
    const intervals: number[] = [];
    for (let i = 1; i < this.messageHistory.length; i++) {
      const interval = this.messageHistory[i].getTime() - this.messageHistory[i - 1].getTime();
      intervals.push(interval);
    }
    
    // Calculate variance in intervals
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    // If standard deviation is too low, it might indicate bot-like regular intervals
    const coefficientOfVariation = stdDev / avgInterval;
    
    return coefficientOfVariation > 0.3; // Allow some variation
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): {
    minute: { current: number; limit: number; remaining: number };
    hour: { current: number; limit: number; remaining: number };
    day: { current: number; limit: number; remaining: number };
  } {
    return {
      minute: {
        current: this.metrics.messagesPerMinute,
        limit: this.RATE_LIMITS.MESSAGES_PER_MINUTE,
        remaining: Math.max(0, this.RATE_LIMITS.MESSAGES_PER_MINUTE - this.metrics.messagesPerMinute)
      },
      hour: {
        current: this.metrics.messagesPerHour,
        limit: this.RATE_LIMITS.MESSAGES_PER_HOUR,
        remaining: Math.max(0, this.RATE_LIMITS.MESSAGES_PER_HOUR - this.metrics.messagesPerHour)
      },
      day: {
        current: this.metrics.messagesPerDay,
        limit: this.RATE_LIMITS.MESSAGES_PER_DAY,
        remaining: Math.max(0, this.RATE_LIMITS.MESSAGES_PER_DAY - this.metrics.messagesPerDay)
      }
    };
  }

  /**
   * Check if sending a message would violate rate limits
   */
  canSendMessage(): { allowed: boolean; reason?: string; waitTime?: number } {
    this.updateMessageMetrics();
    
    if (this.metrics.messagesPerMinute >= this.RATE_LIMITS.MESSAGES_PER_MINUTE) {
      const nextMinute = new Date(Math.ceil(Date.now() / 60000) * 60000);
      return {
        allowed: false,
        reason: 'Minute rate limit exceeded',
        waitTime: nextMinute.getTime() - Date.now()
      };
    }
    
    if (this.metrics.messagesPerHour >= this.RATE_LIMITS.MESSAGES_PER_HOUR) {
      const nextHour = new Date(Math.ceil(Date.now() / 3600000) * 3600000);
      return {
        allowed: false,
        reason: 'Hour rate limit exceeded',
        waitTime: nextHour.getTime() - Date.now()
      };
    }
    
    if (this.metrics.messagesPerDay >= this.RATE_LIMITS.MESSAGES_PER_DAY) {
      const nextDay = new Date();
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);
      return {
        allowed: false,
        reason: 'Daily rate limit exceeded',
        waitTime: nextDay.getTime() - Date.now()
      };
    }
    
    return { allowed: true };
  }

  /**
   * Get best practices recommendations
   */
  getBestPractices(): string[] {
    return [
      'Maintain consistent but varied message timing intervals',
      'Respect rate limits to avoid account restrictions',
      'Keep connection stable to avoid frequent reconnections',
      'Use appropriate message types for different content',
      'Monitor delivery status and handle failures gracefully',
      'Implement proper error handling and retry mechanisms',
      'Use official Baileys library and keep it updated',
      'Follow WhatsApp Business API guidelines where applicable',
      'Implement proper session management and persistence',
      'Monitor protocol compliance regularly'
    ];
  }

  /**
   * Get current metrics
   */
  getMetrics(): ProtocolMetrics {
    this.updateMessageMetrics();
    return { ...this.metrics };
  }

  /**
   * Get last compliance report
   */
  getLastComplianceReport(): ComplianceReport {
    return this.performComplianceCheck();
  }

  /**
   * Update rate limits (for testing or specific use cases)
   */
  updateRateLimits(limits: Partial<typeof this.RATE_LIMITS>): void {
    Object.assign(this.RATE_LIMITS, limits);
    this.emit('rate_limits_updated', this.RATE_LIMITS);
  }

  /**
   * Reset message history (for testing)
   */
  resetMessageHistory(): void {
    this.messageHistory = [];
    this.updateMessageMetrics();
    this.emit('message_history_reset');
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.complianceInterval) {
      clearInterval(this.complianceInterval);
      this.complianceInterval = null;
    }
    
    this.messageHistory = [];
    this.removeAllListeners();
  }
}
