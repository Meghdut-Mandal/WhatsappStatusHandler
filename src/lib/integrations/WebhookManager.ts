import { EventEmitter } from 'events';
import { getSecurityMonitor } from '../security/SecurityMonitor';
import { createHMAC, verifyHMAC } from '../db/crypto';

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  enabled: boolean;
  retryAttempts: number;
  timeout: number; // milliseconds
  headers: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
  lastTriggered?: Date;
  successCount: number;
  failureCount: number;
}

export type WebhookEvent = 
  | 'message.sent'
  | 'message.failed'
  | 'message.scheduled'
  | 'bulk.job.started'
  | 'bulk.job.completed'
  | 'bulk.job.failed'
  | 'file.uploaded'
  | 'file.deleted'
  | 'session.connected'
  | 'session.disconnected'
  | 'security.event'
  | 'system.health';

export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, any>;
  signature?: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  payload: WebhookPayload;
  attempt: number;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  responseCode?: number;
  responseBody?: string;
  error?: string;
  createdAt: Date;
  deliveredAt?: Date;
}

export interface WebhookConfig {
  maxRetryAttempts: number;
  retryDelaySeconds: number;
  maxConcurrentDeliveries: number;
  defaultTimeout: number;
  enableSignatureVerification: boolean;
  cleanupDeliveriesAfterDays: number;
}

export const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  maxRetryAttempts: 3,
  retryDelaySeconds: 30,
  maxConcurrentDeliveries: 5,
  defaultTimeout: 10000, // 10 seconds
  enableSignatureVerification: true,
  cleanupDeliveriesAfterDays: 30
};

export class WebhookManager extends EventEmitter {
  private webhooks: Map<string, WebhookEndpoint> = new Map();
  private deliveries: Map<string, WebhookDelivery> = new Map();
  private activeDeliveries: Set<string> = new Set();
  private config: WebhookConfig;
  private securityMonitor = getSecurityMonitor();
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(config: WebhookConfig = DEFAULT_WEBHOOK_CONFIG) {
    super();
    this.config = config;
    this.startProcessing();
    this.startCleanup();
  }

  /**
   * Register a new webhook endpoint
   */
  async registerWebhook(
    name: string,
    url: string,
    events: WebhookEvent[],
    options?: {
      secret?: string;
      retryAttempts?: number;
      timeout?: number;
      headers?: Record<string, string>;
    }
  ): Promise<string> {
    try {
      const webhookId = this.generateWebhookId();
      
      const webhook: WebhookEndpoint = {
        id: webhookId,
        name,
        url,
        events,
        secret: options?.secret,
        enabled: true,
        retryAttempts: options?.retryAttempts || this.config.maxRetryAttempts,
        timeout: options?.timeout || this.config.defaultTimeout,
        headers: options?.headers || {},
        createdAt: new Date(),
        updatedAt: new Date(),
        successCount: 0,
        failureCount: 0
      };

      this.webhooks.set(webhookId, webhook);

      // Log security event
      await this.securityMonitor.logSecurityEvent({
        type: 'configuration',
        severity: 'medium',
        source: 'WebhookManager',
        description: `Webhook registered: ${name}`,
        metadata: {
          webhookId,
          url,
          events: events.length,
          hasSecret: !!options?.secret
        }
      });

      this.emit('webhookRegistered', webhook);
      return webhookId;

    } catch (error) {
      console.error('Failed to register webhook:', error);
      throw error;
    }
  }

  /**
   * Update webhook configuration
   */
  async updateWebhook(
    webhookId: string,
    updates: Partial<Pick<WebhookEndpoint, 'name' | 'url' | 'events' | 'secret' | 'enabled' | 'retryAttempts' | 'timeout' | 'headers'>>
  ): Promise<boolean> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) return false;

    const updatedWebhook = {
      ...webhook,
      ...updates,
      updatedAt: new Date()
    };

    this.webhooks.set(webhookId, updatedWebhook);

    await this.securityMonitor.logSecurityEvent({
      type: 'configuration',
      severity: 'low',
      source: 'WebhookManager',
      description: `Webhook updated: ${webhook.name}`,
      metadata: {
        webhookId,
        updatedFields: Object.keys(updates)
      }
    });

    this.emit('webhookUpdated', updatedWebhook);
    return true;
  }

  /**
   * Unregister a webhook
   */
  async unregisterWebhook(webhookId: string): Promise<boolean> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) return false;

    this.webhooks.delete(webhookId);

    // Cancel pending deliveries for this webhook
    for (const [deliveryId, delivery] of this.deliveries.entries()) {
      if (delivery.webhookId === webhookId && delivery.status === 'pending') {
        delivery.status = 'failed';
        delivery.error = 'Webhook unregistered';
        this.deliveries.set(deliveryId, delivery);
      }
    }

    await this.securityMonitor.logSecurityEvent({
      type: 'configuration',
      severity: 'low',
      source: 'WebhookManager',
      description: `Webhook unregistered: ${webhook.name}`,
      metadata: { webhookId }
    });

    this.emit('webhookUnregistered', webhook);
    return true;
  }

  /**
   * Trigger webhooks for a specific event
   */
  async triggerWebhooks(event: WebhookEvent, data: Record<string, any>): Promise<void> {
    try {
      const relevantWebhooks = Array.from(this.webhooks.values())
        .filter(webhook => webhook.enabled && webhook.events.includes(event));

      if (relevantWebhooks.length === 0) return;

      const payload: WebhookPayload = {
        id: this.generatePayloadId(),
        event,
        timestamp: new Date().toISOString(),
        data
      };

      for (const webhook of relevantWebhooks) {
        await this.scheduleDelivery(webhook, payload);
      }

    } catch (error) {
      console.error('Failed to trigger webhooks:', error);
    }
  }

  /**
   * Schedule webhook delivery
   */
  private async scheduleDelivery(webhook: WebhookEndpoint, payload: WebhookPayload): Promise<void> {
    try {
      // Add signature if secret is provided
      if (webhook.secret && this.config.enableSignatureVerification) {
        payload.signature = createHMAC(JSON.stringify(payload.data), webhook.secret);
      }

      const deliveryId = this.generateDeliveryId();
      const delivery: WebhookDelivery = {
        id: deliveryId,
        webhookId: webhook.id,
        payload,
        attempt: 0,
        status: 'pending',
        createdAt: new Date()
      };

      this.deliveries.set(deliveryId, delivery);
      this.emit('deliveryScheduled', delivery);

    } catch (error) {
      console.error('Failed to schedule delivery:', error);
    }
  }

  /**
   * Start processing pending deliveries
   */
  private startProcessing(): void {
    this.processingInterval = setInterval(async () => {
      await this.processPendingDeliveries();
    }, 5000); // Process every 5 seconds
  }

  /**
   * Process pending webhook deliveries
   */
  private async processPendingDeliveries(): Promise<void> {
    if (this.activeDeliveries.size >= this.config.maxConcurrentDeliveries) {
      return;
    }

    const pendingDeliveries = Array.from(this.deliveries.values())
      .filter(delivery => 
        (delivery.status === 'pending' || delivery.status === 'retrying') &&
        !this.activeDeliveries.has(delivery.id)
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const availableSlots = this.config.maxConcurrentDeliveries - this.activeDeliveries.size;
    const deliveriesToProcess = pendingDeliveries.slice(0, availableSlots);

    for (const delivery of deliveriesToProcess) {
      this.deliverWebhook(delivery);
    }
  }

  /**
   * Deliver a webhook
   */
  private async deliverWebhook(delivery: WebhookDelivery): Promise<void> {
    this.activeDeliveries.add(delivery.id);
    
    try {
      const webhook = this.webhooks.get(delivery.webhookId);
      if (!webhook) {
        delivery.status = 'failed';
        delivery.error = 'Webhook not found';
        this.deliveries.set(delivery.id, delivery);
        return;
      }

      delivery.attempt++;
      delivery.status = 'pending';
      this.deliveries.set(delivery.id, delivery);

      // Prepare request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), webhook.timeout);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'WhatsApp-Status-Handler-Webhook/1.0',
          ...webhook.headers
        },
        body: JSON.stringify(delivery.payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      delivery.responseCode = response.status;
      delivery.responseBody = await response.text();
      delivery.deliveredAt = new Date();

      if (response.ok) {
        delivery.status = 'success';
        webhook.successCount++;
        webhook.lastTriggered = new Date();
        this.webhooks.set(webhook.id, webhook);
        this.emit('deliverySuccess', delivery);
      } else {
        throw new Error(`HTTP ${response.status}: ${delivery.responseBody}`);
      }

    } catch (error) {
      console.error(`Webhook delivery failed (attempt ${delivery.attempt}):`, error);
      
      delivery.error = error instanceof Error ? error.message : 'Unknown error';
      
      const webhook = this.webhooks.get(delivery.webhookId);
      if (webhook && delivery.attempt < webhook.retryAttempts) {
        // Schedule retry
        delivery.status = 'retrying';
        setTimeout(() => {
          delivery.status = 'pending';
          this.deliveries.set(delivery.id, delivery);
        }, this.config.retryDelaySeconds * 1000);
      } else {
        delivery.status = 'failed';
        if (webhook) {
          webhook.failureCount++;
          this.webhooks.set(webhook.id, webhook);
        }
        this.emit('deliveryFailed', delivery);
      }
      
      this.deliveries.set(delivery.id, delivery);
    } finally {
      this.activeDeliveries.delete(delivery.id);
    }
  }

  /**
   * Get webhook by ID
   */
  getWebhook(webhookId: string): WebhookEndpoint | undefined {
    return this.webhooks.get(webhookId);
  }

  /**
   * List all webhooks
   */
  listWebhooks(): WebhookEndpoint[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Get delivery by ID
   */
  getDelivery(deliveryId: string): WebhookDelivery | undefined {
    return this.deliveries.get(deliveryId);
  }

  /**
   * List deliveries for a webhook
   */
  listDeliveries(webhookId?: string, limit: number = 100): WebhookDelivery[] {
    const deliveries = Array.from(this.deliveries.values())
      .filter(delivery => !webhookId || delivery.webhookId === webhookId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);

    return deliveries;
  }

  /**
   * Test webhook endpoint
   */
  async testWebhook(webhookId: string): Promise<WebhookDelivery> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const testPayload: WebhookPayload = {
      id: this.generatePayloadId(),
      event: 'system.health',
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        message: 'This is a test webhook delivery',
        timestamp: new Date().toISOString()
      }
    };

    await this.scheduleDelivery(webhook, testPayload);
    
    // Find the scheduled delivery
    const delivery = Array.from(this.deliveries.values())
      .find(d => d.webhookId === webhookId && d.payload.id === testPayload.id);

    if (!delivery) {
      throw new Error('Failed to schedule test delivery');
    }

    return delivery;
  }

  /**
   * Start cleanup process
   */
  private startCleanup(): void {
    // Run cleanup daily at 5 AM
    const now = new Date();
    const tomorrow5AM = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 5, 0, 0);
    const msUntil5AM = tomorrow5AM.getTime() - now.getTime();

    setTimeout(() => {
      this.cleanupOldDeliveries();
      // Then run daily
      setInterval(() => this.cleanupOldDeliveries(), 24 * 60 * 60 * 1000);
    }, msUntil5AM);
  }

  /**
   * Clean up old deliveries
   */
  private async cleanupOldDeliveries(): Promise<void> {
    const cutoffDate = new Date(Date.now() - this.config.cleanupDeliveriesAfterDays * 24 * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [deliveryId, delivery] of this.deliveries.entries()) {
      if (delivery.createdAt < cutoffDate && delivery.status !== 'pending' && delivery.status !== 'retrying') {
        this.deliveries.delete(deliveryId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      await this.securityMonitor.logSecurityEvent({
        type: 'configuration',
        severity: 'low',
        source: 'WebhookManager',
        description: `Cleaned up ${cleanedCount} old webhook deliveries`,
        metadata: { cleanedCount, cutoffDate: cutoffDate.toISOString() }
      });
    }
  }

  /**
   * Generate unique webhook ID
   */
  private generateWebhookId(): string {
    return `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique payload ID
   */
  private generatePayloadId(): string {
    return `pl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique delivery ID
   */
  private generateDeliveryId(): string {
    return `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get webhook statistics
   */
  getStatistics(): {
    totalWebhooks: number;
    enabledWebhooks: number;
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    pendingDeliveries: number;
  } {
    const webhooks = Array.from(this.webhooks.values());
    const deliveries = Array.from(this.deliveries.values());

    return {
      totalWebhooks: webhooks.length,
      enabledWebhooks: webhooks.filter(w => w.enabled).length,
      totalDeliveries: deliveries.length,
      successfulDeliveries: deliveries.filter(d => d.status === 'success').length,
      failedDeliveries: deliveries.filter(d => d.status === 'failed').length,
      pendingDeliveries: deliveries.filter(d => d.status === 'pending' || d.status === 'retrying').length
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<WebhookConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Stop webhook manager
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }
}

// Global webhook manager instance
let webhookManager: WebhookManager | null = null;

export function getWebhookManager(config?: WebhookConfig): WebhookManager {
  if (!webhookManager) {
    webhookManager = new WebhookManager(config);
  }
  return webhookManager;
}

export function resetWebhookManager(): void {
  if (webhookManager) {
    webhookManager.stop();
    webhookManager = null;
  }
}
