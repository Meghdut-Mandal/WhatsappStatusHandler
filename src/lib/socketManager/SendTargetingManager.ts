import { WASocket } from '@whiskeysockets/baileys';
import { ContactInfo, GroupInfo } from './ContactManager';
import { EventEmitter } from 'events';

export interface SendTarget {
  id: string;
  type: 'contact' | 'group' | 'broadcast' | 'status';
  name: string;
  recipient: string; // JID for WhatsApp
  verified?: boolean;
  canSend?: boolean;
  metadata?: any;
}

export interface BroadcastList {
  id: string;
  name: string;
  description?: string;
  recipients: SendTarget[];
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface ScheduledSend {
  id: string;
  targets: SendTarget[];
  files: string[]; // File IDs or paths
  caption?: string;
  scheduledTime: Date;
  intervalBetween?: number; // milliseconds between sends
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  errors?: string[];
}

export interface SendConfirmation {
  targets: SendTarget[];
  files: Array<{ name: string; size: number; type: string }>;
  caption?: string;
  estimatedTime: number;
  warnings: string[];
  totalRecipients: number;
  requiresConfirmation: boolean;
}

export interface MultiSendOptions {
  targets: SendTarget[];
  files: string[];
  caption?: string;
  sendAsDocument?: boolean;
  intervalBetween?: number;
  confirmBeforeSend?: boolean;
  retryFailures?: boolean;
  maxRetries?: number;
}

export interface MultiSendResult {
  id: string;
  totalTargets: number;
  successful: Array<{ target: SendTarget; messageId: string; sentAt: Date }>;
  failed: Array<{ target: SendTarget; error: string; attemptedAt: Date }>;
  skipped: Array<{ target: SendTarget; reason: string }>;
  duration: number;
  startTime: Date;
  endTime: Date;
}

export class SendTargetingManager extends EventEmitter {
  private socket: WASocket;
  private broadcastLists: Map<string, BroadcastList> = new Map();
  private scheduledSends: Map<string, ScheduledSend> = new Map();
  private activeMultiSends: Set<string> = new Set();

  constructor(socket: WASocket) {
    super();
    this.socket = socket;
  }

  /**
   * Create send confirmation dialog data
   */
  async createSendConfirmation(options: MultiSendOptions): Promise<SendConfirmation> {
    const warnings: string[] = [];
    const totalRecipients = options.targets.length;
    let estimatedTime = 0;

    // Validate targets and collect warnings
    for (const target of options.targets) {
      if (!target.canSend) {
        warnings.push(`Cannot send to ${target.name} - insufficient permissions`);
      }

      if (target.type === 'group') {
        estimatedTime += 2000; // Groups take longer
      } else {
        estimatedTime += 1000; // Regular contacts
      }
    }

    // Add interval time
    if (options.intervalBetween) {
      estimatedTime += (totalRecipients - 1) * options.intervalBetween;
    }

    // File size warnings
    const totalFiles = options.files.length;
    if (totalFiles > 5) {
      warnings.push(`Sending ${totalFiles} files may take a long time`);
    }

    // Large recipient list warning
    if (totalRecipients > 20) {
      warnings.push(`Sending to ${totalRecipients} recipients may trigger WhatsApp rate limits`);
    }

    return {
      targets: options.targets,
      files: options.files.map(f => ({ name: f, size: 0, type: '' })), // Would get actual file info
      caption: options.caption,
      estimatedTime,
      warnings,
      totalRecipients,
      requiresConfirmation: warnings.length > 0 || totalRecipients > 10 || totalFiles > 3,
    };
  }

  /**
   * Send to multiple targets
   */
  async sendToMultiple(options: MultiSendOptions): Promise<MultiSendResult> {
    const sendId = crypto.randomUUID();
    const startTime = new Date();

    if (this.activeMultiSends.has(sendId)) {
      throw new Error('Send ID collision - please retry');
    }

    this.activeMultiSends.add(sendId);
    
    try {
      // Create confirmation if required
      if (options.confirmBeforeSend) {
        const confirmation = await this.createSendConfirmation(options);
        this.emit('send_confirmation_required', { sendId, confirmation });
        
        // In a real implementation, you'd wait for user confirmation
        // For now, we'll proceed automatically
      }

      const result: MultiSendResult = {
        id: sendId,
        totalTargets: options.targets.length,
        successful: [],
        failed: [],
        skipped: [],
        duration: 0,
        startTime,
        endTime: new Date(),
      };

      this.emit('multi_send_started', { sendId, targets: options.targets.length });

      // Process each target
      for (let i = 0; i < options.targets.length; i++) {
        const target = options.targets[i];

        try {
          // Check if target can receive messages
          if (!target.canSend) {
            result.skipped.push({
              target,
              reason: 'Insufficient permissions or target unavailable'
            });
            continue;
          }

          // Send to target
          const messageId = await this.sendToTarget(target, options.files, options.caption, options.sendAsDocument);
          
          result.successful.push({
            target,
            messageId,
            sentAt: new Date()
          });

          this.emit('multi_send_progress', {
            sendId,
            completed: i + 1,
            total: options.targets.length,
            target: target.name
          });

          // Apply interval between sends
          if (i < options.targets.length - 1 && options.intervalBetween) {
            await new Promise(resolve => setTimeout(resolve, options.intervalBetween));
          }

        } catch (error) {
          result.failed.push({
            target,
            error: error instanceof Error ? error.message : 'Unknown error',
            attemptedAt: new Date()
          });

          this.emit('multi_send_error', {
            sendId,
            target: target.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          });

          // Retry logic
          if (options.retryFailures && (options.maxRetries || 1) > 1) {
            // Implement retry logic here
          }
        }
      }

      result.endTime = new Date();
      result.duration = result.endTime.getTime() - result.startTime.getTime();

      this.emit('multi_send_completed', { sendId, result });
      return result;

    } finally {
      this.activeMultiSends.delete(sendId);
    }
  }

  /**
   * Create broadcast list
   */
  async createBroadcastList(name: string, recipients: SendTarget[], description?: string): Promise<BroadcastList> {
    const broadcastList: BroadcastList = {
      id: crypto.randomUUID(),
      name,
      description,
      recipients,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    };

    this.broadcastLists.set(broadcastList.id, broadcastList);
    this.emit('broadcast_list_created', broadcastList);

    return broadcastList;
  }

  /**
   * Update broadcast list
   */
  async updateBroadcastList(id: string, updates: Partial<BroadcastList>): Promise<BroadcastList | null> {
    const list = this.broadcastLists.get(id);
    if (!list) return null;

    const updated = {
      ...list,
      ...updates,
      updatedAt: new Date(),
    };

    this.broadcastLists.set(id, updated);
    this.emit('broadcast_list_updated', updated);

    return updated;
  }

  /**
   * Delete broadcast list
   */
  async deleteBroadcastList(id: string): Promise<boolean> {
    const deleted = this.broadcastLists.delete(id);
    if (deleted) {
      this.emit('broadcast_list_deleted', id);
    }
    return deleted;
  }

  /**
   * Get broadcast lists
   */
  getBroadcastLists(): BroadcastList[] {
    return Array.from(this.broadcastLists.values())
      .filter(list => list.isActive)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * Send to broadcast list
   */
  async sendToBroadcastList(listId: string, files: string[], caption?: string): Promise<MultiSendResult> {
    const list = this.broadcastLists.get(listId);
    if (!list) {
      throw new Error('Broadcast list not found');
    }

    return this.sendToMultiple({
      targets: list.recipients,
      files,
      caption,
      intervalBetween: 2000, // 2 second interval for broadcast
      confirmBeforeSend: true,
      retryFailures: true,
      maxRetries: 2,
    });
  }

  /**
   * Schedule send
   */
  async scheduleSend(
    targets: SendTarget[],
    files: string[],
    scheduledTime: Date,
    options: {
      caption?: string;
      intervalBetween?: number;
    } = {}
  ): Promise<ScheduledSend> {
    if (scheduledTime <= new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    const scheduledSend: ScheduledSend = {
      id: crypto.randomUUID(),
      targets,
      files,
      caption: options.caption,
      scheduledTime,
      intervalBetween: options.intervalBetween,
      status: 'pending',
      createdAt: new Date(),
    };

    this.scheduledSends.set(scheduledSend.id, scheduledSend);

    // Schedule the actual send
    const delay = scheduledTime.getTime() - Date.now();
    setTimeout(async () => {
      await this.executeScheduledSend(scheduledSend.id);
    }, delay);

    this.emit('send_scheduled', scheduledSend);
    return scheduledSend;
  }

  /**
   * Cancel scheduled send
   */
  async cancelScheduledSend(id: string): Promise<boolean> {
    const scheduledSend = this.scheduledSends.get(id);
    if (!scheduledSend || scheduledSend.status !== 'pending') {
      return false;
    }

    scheduledSend.status = 'cancelled';
    this.scheduledSends.set(id, scheduledSend);

    this.emit('send_cancelled', id);
    return true;
  }

  /**
   * Get scheduled sends
   */
  getScheduledSends(status?: ScheduledSend['status']): ScheduledSend[] {
    return Array.from(this.scheduledSends.values())
      .filter(send => !status || send.status === status)
      .sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
  }

  /**
   * Convert contacts to send targets
   */
  contactsToTargets(contacts: ContactInfo[]): SendTarget[] {
    return contacts.map(contact => ({
      id: contact.id,
      type: 'contact' as const,
      name: contact.name || contact.pushName || contact.notify || contact.id,
      recipient: contact.id,
      verified: contact.isMyContact,
      canSend: !contact.isBlocked,
      metadata: contact,
    }));
  }

  /**
   * Convert groups to send targets
   */
  groupsToTargets(groups: GroupInfo[]): SendTarget[] {
    return groups.map(group => ({
      id: group.id,
      type: 'group' as const,
      name: group.subject,
      recipient: group.id,
      verified: true,
      canSend: group.canSend || false,
      metadata: group,
    }));
  }

  /**
   * Get send statistics
   */
  getSendStatistics() {
    const now = new Date();
    const scheduledSends = Array.from(this.scheduledSends.values());

    return {
      broadcastLists: this.broadcastLists.size,
      activeScheduledSends: scheduledSends.filter(s => s.status === 'pending').length,
      completedScheduledSends: scheduledSends.filter(s => s.status === 'completed').length,
      failedScheduledSends: scheduledSends.filter(s => s.status === 'failed').length,
      upcomingScheduledSends: scheduledSends.filter(s => 
        s.status === 'pending' && s.scheduledTime > now
      ).length,
      activeMultiSends: this.activeMultiSends.size,
    };
  }

  /**
   * Private helper methods
   */
  private async sendToTarget(
    target: SendTarget,
    files: string[],
    caption?: string,
    sendAsDocument?: boolean
  ): Promise<string> {
    // This would integrate with your MessageSender
    // For now, simulate the send
    const { MessageSender } = await import('./MessageSender');
    const messageSender = new MessageSender(this.socket);

    const sendOptions = {
      sessionId: 'current', // Would get from session manager
      targetType: target.type,
      targetId: target.recipient,
      files,
      caption,
      sendAsDocument,
    };

    const result = await messageSender.sendToTarget(sendOptions as any);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to send message');
    }

    return result.messageId || crypto.randomUUID();
  }

  private async executeScheduledSend(id: string): Promise<void> {
    const scheduledSend = this.scheduledSends.get(id);
    if (!scheduledSend || scheduledSend.status !== 'pending') {
      return;
    }

    scheduledSend.status = 'processing';
    scheduledSend.processedAt = new Date();
    this.scheduledSends.set(id, scheduledSend);

    try {
      const result = await this.sendToMultiple({
        targets: scheduledSend.targets,
        files: scheduledSend.files,
        caption: scheduledSend.caption,
        intervalBetween: scheduledSend.intervalBetween,
        retryFailures: true,
      });

      scheduledSend.status = result.failed.length === 0 ? 'completed' : 'failed';
      scheduledSend.completedAt = new Date();
      
      if (result.failed.length > 0) {
        scheduledSend.errors = result.failed.map(f => f.error);
      }

      this.scheduledSends.set(id, scheduledSend);
      this.emit('scheduled_send_completed', { id, result });

    } catch (error) {
      scheduledSend.status = 'failed';
      scheduledSend.completedAt = new Date();
      scheduledSend.errors = [error instanceof Error ? error.message : 'Unknown error'];
      
      this.scheduledSends.set(id, scheduledSend);
      this.emit('scheduled_send_failed', { id, error });
    }
  }
}
