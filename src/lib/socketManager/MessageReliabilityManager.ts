/**
 * Message Reliability and Retry Manager
 * Week 4 - Developer B Implementation
 */

import { EventEmitter } from 'events';
import { proto, WASocket } from '@whiskeysockets/baileys';
import { SendHistoryService } from '../db';
import { errorHandler, ErrorCategory } from '../errors/ErrorHandler';

export interface MessageAttempt {
  id: string;
  timestamp: Date;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
  retryCount: number;
  messageId?: string;
}

export interface ReliableMessage {
  id: string;
  sessionId: string;
  targetType: 'status' | 'contact' | 'group';
  targetIdentifier: string;
  content: {
    type: 'text' | 'image' | 'video' | 'document';
    data: Buffer | string;
    mimetype?: string;
    caption?: string;
    filename?: string;
  };
  priority: 'low' | 'normal' | 'high' | 'critical';
  maxRetries: number;
  retryDelay: number;
  attempts: MessageAttempt[];
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'cancelled';
  createdAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface RetryStrategy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  exponentialBackoff: boolean;
  jitter: boolean;
}

export interface DeliveryConfirmation {
  messageId: string;
  status: 'sent' | 'delivered' | 'read';
  timestamp: Date;
  recipient?: string;
}

export class MessageReliabilityManager extends EventEmitter {
  private socket: WASocket | null = null;
  private messageQueue: Map<string, ReliableMessage> = new Map();
  private processingQueue = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private deliveryTracker: Map<string, DeliveryConfirmation> = new Map();
  private duplicateTracker: Set<string> = new Set();
  
  private defaultStrategy: RetryStrategy = {
    maxRetries: 5,
    baseDelay: 5000,
    maxDelay: 300000, // 5 minutes
    backoffMultiplier: 2,
    exponentialBackoff: true,
    jitter: true
  };

  private strategyByPriority: Record<string, RetryStrategy> = {
    low: { ...this.defaultStrategy, maxRetries: 3, baseDelay: 10000 },
    normal: { ...this.defaultStrategy },
    high: { ...this.defaultStrategy, maxRetries: 7, baseDelay: 2000 },
    critical: { ...this.defaultStrategy, maxRetries: 10, baseDelay: 1000, maxDelay: 60000 }
  };

  constructor() {
    super();
    this.startQueueProcessor();
  }

  /**
   * Set WhatsApp socket instance
   */
  setSocket(socket: WASocket | null): void {
    this.socket = socket;
    
    if (socket) {
      this.setupSocketEventHandlers();
    }
  }

  /**
   * Setup socket event handlers for delivery confirmation
   */
  private setupSocketEventHandlers(): void {
    if (!this.socket) return;

    // Handle message updates (delivery confirmations)
    this.socket.ev.on('message.update', (updates) => {
      for (const update of updates) {
        if (update.key?.id && update.update) {
          this.handleDeliveryUpdate(update.key.id, update.update);
        }
      }
    });

    // Handle receipt updates
    this.socket.ev.on('message.receipt.update', (receipts) => {
      for (const receipt of receipts) {
        if (receipt.key?.id) {
          this.handleReceiptUpdate(receipt.key.id, receipt);
        }
      }
    });
  }

  /**
   * Queue a message for reliable delivery
   */
  async queueMessage(message: Omit<ReliableMessage, 'id' | 'attempts' | 'status' | 'createdAt'>): Promise<string> {
    const messageId = this.generateMessageId();
    
    const reliableMessage: ReliableMessage = {
      ...message,
      id: messageId,
      attempts: [],
      status: 'queued',
      createdAt: new Date()
    };

    // Check for duplicates
    const duplicateKey = this.generateDuplicateKey(reliableMessage);
    if (this.duplicateTracker.has(duplicateKey)) {
      throw new Error('Duplicate message detected');
    }
    this.duplicateTracker.add(duplicateKey);

    this.messageQueue.set(messageId, reliableMessage);
    this.emit('message_queued', reliableMessage);

    // Start processing if not already running
    if (!this.processingQueue) {
      this.processQueue();
    }

    return messageId;
  }

  /**
   * Cancel a queued message
   */
  cancelMessage(messageId: string): boolean {
    const message = this.messageQueue.get(messageId);
    if (!message || message.status === 'sent' || message.status === 'delivered') {
      return false;
    }

    message.status = 'cancelled';
    message.completedAt = new Date();
    
    this.emit('message_cancelled', message);
    this.messageQueue.delete(messageId);
    
    return true;
  }

  /**
   * Get message status
   */
  getMessageStatus(messageId: string): ReliableMessage | undefined {
    return this.messageQueue.get(messageId);
  }

  /**
   * Get all queued messages
   */
  getQueuedMessages(): ReliableMessage[] {
    return Array.from(this.messageQueue.values());
  }

  /**
   * Get failed messages
   */
  getFailedMessages(): ReliableMessage[] {
    return Array.from(this.messageQueue.values()).filter(m => m.status === 'failed');
  }

  /**
   * Retry a failed message
   */
  async retryMessage(messageId: string): Promise<boolean> {
    const message = this.messageQueue.get(messageId);
    if (!message || message.status !== 'failed') {
      return false;
    }

    // Reset status and retry
    message.status = 'queued';
    message.attempts = []; // Clear previous attempts for fresh retry
    
    this.emit('message_retry_requested', message);
    
    if (!this.processingQueue) {
      this.processQueue();
    }

    return true;
  }

  /**
   * Start queue processor
   */
  private startQueueProcessor(): void {
    this.processingInterval = setInterval(() => {
      if (!this.processingQueue && this.messageQueue.size > 0) {
        this.processQueue();
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Process message queue
   */
  private async processQueue(): Promise<void> {
    if (this.processingQueue || !this.socket) {
      return;
    }

    this.processingQueue = true;

    try {
      const queuedMessages = Array.from(this.messageQueue.values())
        .filter(m => m.status === 'queued')
        .sort((a, b) => {
          // Sort by priority and creation time
          const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
          const aPriority = priorityOrder[a.priority];
          const bPriority = priorityOrder[b.priority];
          
          if (aPriority !== bPriority) {
            return bPriority - aPriority;
          }
          
          return a.createdAt.getTime() - b.createdAt.getTime();
        });

      for (const message of queuedMessages) {
        await this.processMessage(message);
        
        // Small delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      errorHandler.handleError(error, {
        category: ErrorCategory.WHATSAPP,
        severity: 'medium',
        context: { component: 'MessageReliabilityManager', action: 'process_queue' }
      });
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Process individual message
   */
  private async processMessage(message: ReliableMessage): Promise<void> {
    const strategy = this.strategyByPriority[message.priority] || this.defaultStrategy;
    
    // Check if we should retry
    if (message.attempts.length >= strategy.maxRetries) {
      message.status = 'failed';
      message.completedAt = new Date();
      this.emit('message_failed', message);
      this.messageQueue.delete(message.id);
      return;
    }

    // Check if we need to wait before retry
    const lastAttempt = message.attempts[message.attempts.length - 1];
    if (lastAttempt && lastAttempt.status === 'failed') {
      const delay = this.calculateRetryDelay(message.attempts.length, strategy);
      const timeSinceLastAttempt = Date.now() - lastAttempt.timestamp.getTime();
      
      if (timeSinceLastAttempt < delay) {
        return; // Wait longer
      }
    }

    // Create new attempt
    const attempt: MessageAttempt = {
      id: this.generateAttemptId(),
      timestamp: new Date(),
      status: 'pending',
      retryCount: message.attempts.length
    };

    message.attempts.push(attempt);
    message.status = 'sending';

    try {
      this.emit('message_attempt_started', { message, attempt });
      
      // Send message
      const result = await this.sendMessage(message);
      
      if (result) {
        attempt.status = 'sent';
        attempt.messageId = result.key?.id;
        message.status = 'sent';
        
        // Track for delivery confirmation
        if (result.key?.id) {
          this.trackDelivery(result.key.id, message);
        }

        // Save to send history
        await this.saveToHistory(message, result);
        
        this.emit('message_sent', { message, attempt, result });
        
        // Don't remove from queue yet - wait for delivery confirmation
      } else {
        throw new Error('Failed to send message - no result returned');
      }
      
    } catch (error) {
      attempt.status = 'failed';
      attempt.error = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if this was the last retry
      if (message.attempts.length >= strategy.maxRetries) {
        message.status = 'failed';
        message.completedAt = new Date();
        this.emit('message_failed', { message, attempt, error });
        this.messageQueue.delete(message.id);
      } else {
        message.status = 'queued'; // Queue for retry
        this.emit('message_attempt_failed', { message, attempt, error });
      }

      errorHandler.handleError(error, {
        category: ErrorCategory.WHATSAPP,
        severity: 'medium',
        context: { 
          component: 'MessageReliabilityManager', 
          action: 'send_message',
          messageId: message.id,
          attempt: message.attempts.length
        }
      });
    }
  }

  /**
   * Send message via WhatsApp socket
   */
  private async sendMessage(message: ReliableMessage): Promise<any> {
    if (!this.socket) {
      throw new Error('WhatsApp socket not available');
    }

    let target: string;
    switch (message.targetType) {
      case 'status':
        target = 'status@broadcast';
        break;
      case 'group':
        target = message.targetIdentifier;
        break;
      case 'contact':
        target = message.targetIdentifier.includes('@') 
          ? message.targetIdentifier 
          : `${message.targetIdentifier}@s.whatsapp.net`;
        break;
      default:
        throw new Error(`Unsupported target type: ${message.targetType}`);
    }

    const content = message.content;
    let messageContent: any;

    switch (content.type) {
      case 'text':
        messageContent = { text: content.data as string };
        break;
      case 'image':
        messageContent = {
          image: content.data as Buffer,
          caption: content.caption,
          mimetype: content.mimetype
        };
        break;
      case 'video':
        messageContent = {
          video: content.data as Buffer,
          caption: content.caption,
          mimetype: content.mimetype
        };
        break;
      case 'document':
        messageContent = {
          document: content.data as Buffer,
          mimetype: content.mimetype,
          fileName: content.filename || 'document'
        };
        break;
      default:
        throw new Error(`Unsupported content type: ${content.type}`);
    }

    return await this.socket.sendMessage(target, messageContent);
  }

  /**
   * Handle delivery update
   */
  private handleDeliveryUpdate(messageId: string, update: any): void {
    const confirmation: DeliveryConfirmation = {
      messageId,
      status: 'delivered',
      timestamp: new Date()
    };

    if (update.status === proto.WebMessageInfo.Status.DELIVERY_ACK) {
      confirmation.status = 'delivered';
    } else if (update.status === proto.WebMessageInfo.Status.READ) {
      confirmation.status = 'read';
    }

    this.deliveryTracker.set(messageId, confirmation);
    
    // Find corresponding message in queue
    for (const [id, message] of this.messageQueue) {
      const attempt = message.attempts.find(a => a.messageId === messageId);
      if (attempt) {
        message.status = confirmation.status === 'read' ? 'delivered' : 'sent';
        message.completedAt = new Date();
        
        this.emit('message_delivered', { message, confirmation });
        
        // Remove from queue if delivered
        if (confirmation.status === 'delivered' || confirmation.status === 'read') {
          this.messageQueue.delete(id);
        }
        break;
      }
    }
  }

  /**
   * Handle receipt update
   */
  private handleReceiptUpdate(messageId: string, receipt: any): void {
    // Similar to delivery update but for read receipts
    this.handleDeliveryUpdate(messageId, { status: proto.WebMessageInfo.Status.READ });
  }

  /**
   * Track message for delivery confirmation
   */
  private trackDelivery(messageId: string, message: ReliableMessage): void {
    // Set timeout for delivery confirmation
    setTimeout(() => {
      if (!this.deliveryTracker.has(messageId)) {
        // No delivery confirmation received, mark as delivered anyway
        const confirmation: DeliveryConfirmation = {
          messageId,
          status: 'delivered',
          timestamp: new Date()
        };
        
        this.deliveryTracker.set(messageId, confirmation);
        
        // Update message status
        message.status = 'delivered';
        message.completedAt = new Date();
        
        this.emit('message_delivered_timeout', { message, confirmation });
        this.messageQueue.delete(message.id);
      }
    }, 60000); // 1 minute timeout
  }

  /**
   * Save message to send history
   */
  private async saveToHistory(message: ReliableMessage, result: any): Promise<void> {
    try {
      await SendHistoryService.create({
        sessionId: message.sessionId,
        targetType: message.targetType,
        targetIdentifier: message.targetIdentifier,
        files: [{
          filename: message.content.filename || 'message',
          mimetype: message.content.mimetype || 'text/plain',
          size: Buffer.isBuffer(message.content.data) ? message.content.data.length : message.content.data.toString().length
        }],
        status: 'sent',
        messageId: result.key?.id,
        completedAt: new Date()
      });
    } catch (error) {
      errorHandler.handleError(error, {
        category: ErrorCategory.DATABASE,
        severity: 'low',
        context: { 
          component: 'MessageReliabilityManager', 
          action: 'save_to_history',
          messageId: message.id
        }
      });
    }
  }

  /**
   * Calculate retry delay
   */
  private calculateRetryDelay(attemptCount: number, strategy: RetryStrategy): number {
    let delay = strategy.baseDelay;
    
    if (strategy.exponentialBackoff) {
      delay = strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attemptCount - 1);
    }
    
    delay = Math.min(delay, strategy.maxDelay);
    
    if (strategy.jitter) {
      // Add ±25% jitter
      const jitterRange = delay * 0.25;
      delay += (Math.random() - 0.5) * 2 * jitterRange;
    }
    
    return Math.max(delay, strategy.baseDelay);
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique attempt ID
   */
  private generateAttemptId(): string {
    return `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate duplicate detection key
   */
  private generateDuplicateKey(message: ReliableMessage): string {
    const contentHash = Buffer.isBuffer(message.content.data) 
      ? message.content.data.toString('base64').slice(0, 32)
      : message.content.data.toString().slice(0, 32);
    
    return `${message.targetType}_${message.targetIdentifier}_${contentHash}`;
  }

  /**
   * Update retry strategy for priority level
   */
  updateRetryStrategy(priority: string, strategy: Partial<RetryStrategy>): void {
    this.strategyByPriority[priority] = {
      ...this.strategyByPriority[priority],
      ...strategy
    };
    
    this.emit('retry_strategy_updated', { priority, strategy });
  }

  /**
   * Get delivery statistics
   */
  getDeliveryStats(): {
    total: number;
    queued: number;
    sending: number;
    sent: number;
    delivered: number;
    failed: number;
    cancelled: number;
  } {
    const messages = Array.from(this.messageQueue.values());
    
    return {
      total: messages.length,
      queued: messages.filter(m => m.status === 'queued').length,
      sending: messages.filter(m => m.status === 'sending').length,
      sent: messages.filter(m => m.status === 'sent').length,
      delivered: messages.filter(m => m.status === 'delivered').length,
      failed: messages.filter(m => m.status === 'failed').length,
      cancelled: messages.filter(m => m.status === 'cancelled').length
    };
  }

  /**
   * Clear completed messages
   */
  clearCompleted(): number {
    const completed = Array.from(this.messageQueue.entries())
      .filter(([_, message]) => 
        message.status === 'delivered' || 
        message.status === 'failed' || 
        message.status === 'cancelled'
      );
    
    for (const [id] of completed) {
      this.messageQueue.delete(id);
    }
    
    return completed.length;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    this.messageQueue.clear();
    this.deliveryTracker.clear();
    this.duplicateTracker.clear();
    this.removeAllListeners();
  }
}
