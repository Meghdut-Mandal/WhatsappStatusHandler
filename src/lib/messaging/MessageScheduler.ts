import { EventEmitter } from 'events';
import { getBaileysManager } from '../socketManager';
import { SendHistoryService } from '../db';
import { getSecurityMonitor } from '../security/SecurityMonitor';

export interface ScheduledMessage {
  id: string;
  targetType: 'status' | 'contact' | 'group';
  targetIdentifier: string;
  content: {
    type: 'text' | 'image' | 'video' | 'document';
    data: Buffer | string;
    caption?: string;
    mimetype?: string;
    filename?: string;
  };
  scheduledFor: Date;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  sentAt?: Date;
  error?: string;
  sessionId: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  description?: string;
  content: {
    type: 'text' | 'image' | 'video' | 'document';
    template: string; // Can contain placeholders like {{name}}, {{date}}
    mediaPath?: string;
    caption?: string;
  };
  variables: string[]; // List of placeholder variables
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
}

export interface SchedulerConfig {
  maxConcurrentMessages: number;
  retryDelayMinutes: number;
  maxRetryAttempts: number;
  cleanupCompletedAfterDays: number;
  enableBatchProcessing: boolean;
  batchSize: number;
  processingIntervalSeconds: number;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxConcurrentMessages: 3,
  retryDelayMinutes: 5,
  maxRetryAttempts: 3,
  cleanupCompletedAfterDays: 7,
  enableBatchProcessing: true,
  batchSize: 10,
  processingIntervalSeconds: 30
};

export class MessageScheduler extends EventEmitter {
  private scheduledMessages: Map<string, ScheduledMessage> = new Map();
  private templates: Map<string, MessageTemplate> = new Map();
  private config: SchedulerConfig;
  private processingInterval: NodeJS.Timeout | null = null;
  private activeSends: Set<string> = new Set();
  private securityMonitor = getSecurityMonitor();

  constructor(config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG) {
    super();
    this.config = config;
    this.startProcessing();
    this.startCleanup();
  }

  /**
   * Schedule a message to be sent later
   */
  async scheduleMessage(
    targetType: 'status' | 'contact' | 'group',
    targetIdentifier: string,
    content: ScheduledMessage['content'],
    scheduledFor: Date,
    sessionId: string,
    maxAttempts?: number
  ): Promise<string> {
    try {
      const messageId = this.generateMessageId();
      
      const scheduledMessage: ScheduledMessage = {
        id: messageId,
        targetType,
        targetIdentifier,
        content,
        scheduledFor,
        status: 'pending',
        attempts: 0,
        maxAttempts: maxAttempts || this.config.maxRetryAttempts,
        createdAt: new Date(),
        sessionId
      };

      this.scheduledMessages.set(messageId, scheduledMessage);

      // Log security event
      await this.securityMonitor.logSecurityEvent({
        type: 'configuration',
        severity: 'low',
        source: 'MessageScheduler',
        description: `Message scheduled for ${scheduledFor.toISOString()}`,
        metadata: {
          messageId,
          targetType,
          scheduledFor: scheduledFor.toISOString(),
          contentType: content.type
        }
      });

      this.emit('messageScheduled', scheduledMessage);
      return messageId;

    } catch (error) {
      console.error('Failed to schedule message:', error);
      throw error;
    }
  }

  /**
   * Cancel a scheduled message
   */
  async cancelMessage(messageId: string): Promise<boolean> {
    const message = this.scheduledMessages.get(messageId);
    if (!message) return false;

    if (message.status === 'pending') {
      message.status = 'cancelled';
      this.scheduledMessages.set(messageId, message);

      await this.securityMonitor.logSecurityEvent({
        type: 'configuration',
        severity: 'low',
        source: 'MessageScheduler',
        description: `Scheduled message cancelled: ${messageId}`,
        metadata: { messageId, originalScheduledFor: message.scheduledFor.toISOString() }
      });

      this.emit('messageCancelled', message);
      return true;
    }

    return false;
  }

  /**
   * Get scheduled message by ID
   */
  getScheduledMessage(messageId: string): ScheduledMessage | undefined {
    return this.scheduledMessages.get(messageId);
  }

  /**
   * List scheduled messages with optional filtering
   */
  listScheduledMessages(filter?: {
    status?: ScheduledMessage['status'];
    targetType?: ScheduledMessage['targetType'];
    sessionId?: string;
  }): ScheduledMessage[] {
    const messages = Array.from(this.scheduledMessages.values());
    
    if (!filter) return messages;

    return messages.filter(message => {
      if (filter.status && message.status !== filter.status) return false;
      if (filter.targetType && message.targetType !== filter.targetType) return false;
      if (filter.sessionId && message.sessionId !== filter.sessionId) return false;
      return true;
    });
  }

  /**
   * Create a message template
   */
  async createTemplate(
    name: string,
    content: MessageTemplate['content'],
    description?: string
  ): Promise<string> {
    const templateId = this.generateTemplateId();
    
    // Extract variables from template
    const variables = this.extractVariables(content.template);
    
    const template: MessageTemplate = {
      id: templateId,
      name,
      description,
      content,
      variables,
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0
    };

    this.templates.set(templateId, template);

    await this.securityMonitor.logSecurityEvent({
      type: 'configuration',
      severity: 'low',
      source: 'MessageScheduler',
      description: `Message template created: ${name}`,
      metadata: {
        templateId,
        name,
        variables: variables.length
      }
    });

    this.emit('templateCreated', template);
    return templateId;
  }

  /**
   * Update a message template
   */
  async updateTemplate(
    templateId: string,
    updates: Partial<Pick<MessageTemplate, 'name' | 'description' | 'content'>>
  ): Promise<boolean> {
    const template = this.templates.get(templateId);
    if (!template) return false;

    const updatedTemplate = {
      ...template,
      ...updates,
      updatedAt: new Date()
    };

    // Re-extract variables if content was updated
    if (updates.content) {
      updatedTemplate.variables = this.extractVariables(updates.content.template);
    }

    this.templates.set(templateId, updatedTemplate);
    this.emit('templateUpdated', updatedTemplate);
    return true;
  }

  /**
   * Delete a message template
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    const template = this.templates.get(templateId);
    if (!template) return false;

    this.templates.delete(templateId);
    this.emit('templateDeleted', template);
    return true;
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): MessageTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * List all templates
   */
  listTemplates(): MessageTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Schedule message using template
   */
  async scheduleFromTemplate(
    templateId: string,
    targetType: 'status' | 'contact' | 'group',
    targetIdentifier: string,
    scheduledFor: Date,
    sessionId: string,
    variables?: Record<string, string>
  ): Promise<string> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Process template with variables
    const processedContent = this.processTemplate(template, variables || {});
    
    // Update usage count
    template.usageCount++;
    this.templates.set(templateId, template);

    return this.scheduleMessage(
      targetType,
      targetIdentifier,
      processedContent,
      scheduledFor,
      sessionId
    );
  }

  /**
   * Start processing scheduled messages
   */
  private startProcessing(): void {
    this.processingInterval = setInterval(async () => {
      await this.processScheduledMessages();
    }, this.config.processingIntervalSeconds * 1000);
  }

  /**
   * Process scheduled messages that are due
   */
  private async processScheduledMessages(): Promise<void> {
    const now = new Date();
    const dueMessages = Array.from(this.scheduledMessages.values())
      .filter(message => 
        message.status === 'pending' && 
        message.scheduledFor <= now &&
        !this.activeSends.has(message.id)
      )
      .slice(0, this.config.batchSize);

    if (dueMessages.length === 0) return;

    // Limit concurrent sends
    const availableSlots = this.config.maxConcurrentMessages - this.activeSends.size;
    const messagesToSend = dueMessages.slice(0, availableSlots);

    for (const message of messagesToSend) {
      this.sendScheduledMessage(message);
    }
  }

  /**
   * Send a scheduled message
   */
  private async sendScheduledMessage(message: ScheduledMessage): Promise<void> {
    this.activeSends.add(message.id);
    
    try {
      const baileysManager = getBaileysManager();
      const messageSender = baileysManager.getMessageSender();

      message.attempts++;
      this.scheduledMessages.set(message.id, message);

      // Send the message
      await messageSender.sendMessage({
        targetType: message.targetType,
        targetIdentifier: message.targetIdentifier,
        files: [{
          buffer: message.content.data as Buffer,
          mimetype: message.content.mimetype || 'text/plain',
          filename: message.content.filename || 'message'
        }],
        caption: message.content.caption,
        sendAsDocument: message.content.type === 'document'
      });

      // Mark as sent
      message.status = 'sent';
      message.sentAt = new Date();
      this.scheduledMessages.set(message.id, message);

      // Save to send history
      await SendHistoryService.create({
        sessionId: message.sessionId,
        targetType: message.targetType,
        targetIdentifier: message.targetIdentifier,
        files: [message.content.filename || 'scheduled_message'],
        status: 'completed',
        completedAt: new Date()
      });

      this.emit('messageSent', message);

    } catch (error) {
      console.error(`Failed to send scheduled message ${message.id}:`, error);
      
      message.error = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if we should retry
      if (message.attempts < message.maxAttempts) {
        // Schedule retry
        message.scheduledFor = new Date(Date.now() + this.config.retryDelayMinutes * 60000);
        message.status = 'pending';
      } else {
        message.status = 'failed';
        this.emit('messageFailed', message);
      }
      
      this.scheduledMessages.set(message.id, message);
    } finally {
      this.activeSends.delete(message.id);
    }
  }

  /**
   * Extract variables from template string
   */
  private extractVariables(template: string): string[] {
    const matches = template.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    
    return [...new Set(matches.map(match => match.replace(/[{}]/g, '')))];
  }

  /**
   * Process template with variables
   */
  private processTemplate(
    template: MessageTemplate, 
    variables: Record<string, string>
  ): ScheduledMessage['content'] {
    let processedTemplate = template.content.template;
    
    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      processedTemplate = processedTemplate.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'), 
        value
      );
    }

    return {
      type: template.content.type,
      data: processedTemplate,
      caption: template.content.caption,
      mimetype: 'text/plain'
    };
  }

  /**
   * Start cleanup process for old messages
   */
  private startCleanup(): void {
    // Run cleanup daily at 3 AM
    const now = new Date();
    const tomorrow3AM = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 3, 0, 0);
    const msUntil3AM = tomorrow3AM.getTime() - now.getTime();

    setTimeout(() => {
      this.cleanupOldMessages();
      // Then run daily
      setInterval(() => this.cleanupOldMessages(), 24 * 60 * 60 * 1000);
    }, msUntil3AM);
  }

  /**
   * Clean up old completed/failed messages
   */
  private async cleanupOldMessages(): Promise<void> {
    const cutoffDate = new Date(Date.now() - this.config.cleanupCompletedAfterDays * 24 * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [messageId, message] of this.scheduledMessages.entries()) {
      if (
        (message.status === 'sent' || message.status === 'failed' || message.status === 'cancelled') &&
        message.createdAt < cutoffDate
      ) {
        this.scheduledMessages.delete(messageId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      await this.securityMonitor.logSecurityEvent({
        type: 'configuration',
        severity: 'low',
        source: 'MessageScheduler',
        description: `Cleaned up ${cleanedCount} old scheduled messages`,
        metadata: { cleanedCount, cutoffDate: cutoffDate.toISOString() }
      });
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique template ID
   */
  private generateTemplateId(): string {
    return `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get scheduler statistics
   */
  getStatistics(): {
    totalScheduled: number;
    pending: number;
    sent: number;
    failed: number;
    cancelled: number;
    activeSends: number;
    totalTemplates: number;
  } {
    const messages = Array.from(this.scheduledMessages.values());
    
    return {
      totalScheduled: messages.length,
      pending: messages.filter(m => m.status === 'pending').length,
      sent: messages.filter(m => m.status === 'sent').length,
      failed: messages.filter(m => m.status === 'failed').length,
      cancelled: messages.filter(m => m.status === 'cancelled').length,
      activeSends: this.activeSends.size,
      totalTemplates: this.templates.size
    };
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(newConfig: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart processing with new interval if changed
    if (newConfig.processingIntervalSeconds && this.processingInterval) {
      clearInterval(this.processingInterval);
      this.startProcessing();
    }
  }

  /**
   * Stop scheduler and cleanup
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }
}

// Global scheduler instance
let messageScheduler: MessageScheduler | null = null;

export function getMessageScheduler(config?: SchedulerConfig): MessageScheduler {
  if (!messageScheduler) {
    messageScheduler = new MessageScheduler(config);
  }
  return messageScheduler;
}

export function resetMessageScheduler(): void {
  if (messageScheduler) {
    messageScheduler.stop();
    messageScheduler = null;
  }
}
