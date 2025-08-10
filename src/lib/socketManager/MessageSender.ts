import { WASocket, proto } from '@whiskeysockets/baileys';
import { createReadStream } from 'fs';
import { SendHistoryService, MediaMetaService } from '../db';
import { MessageReliabilityManager } from './MessageReliabilityManager';
import { ProtocolCompliance } from './ProtocolCompliance';
import { errorHandler, ErrorCategory } from '../errors/ErrorHandler';

export interface SendOptions {
  sessionId: string;
  targetType: 'status' | 'contact' | 'group';
  targetIdentifier?: string; // Phone number for contact, group ID for group
  caption?: string;
  files: string[]; // Array of media meta IDs
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  sentAt?: Date;
}

export interface ContactInfo {
  id: string;
  name?: string;
  notify?: string;
  verifiedName?: string;
}

export interface GroupInfo {
  id: string;
  subject: string;
  description?: string;
  participantsCount: number;
  creation?: number;
  owner?: string;
}

export class MessageSender {
  private reliabilityManager: MessageReliabilityManager;
  private protocolCompliance: ProtocolCompliance;

  constructor(private socket: WASocket) {
    this.reliabilityManager = new MessageReliabilityManager();
    this.protocolCompliance = new ProtocolCompliance();
    
    // Set socket for both managers
    this.reliabilityManager.setSocket(socket);
    this.protocolCompliance.setSocket(socket);
  }

  /**
   * Send media to WhatsApp Status
   */
  async sendToStatus(options: SendOptions): Promise<SendResult> {
    try {
      if (!this.socket) {
        throw new Error('WhatsApp socket not available');
      }

      // Create send history record
      const sendHistory = await SendHistoryService.create({
        sessionId: options.sessionId,
        targetType: 'status',
        files: options.files,
        status: 'sending',
      });

      const results: SendResult[] = [];

      // Send each file
      for (const fileId of options.files) {
        try {
          const mediaMeta = await MediaMetaService.getById(fileId);
          if (!mediaMeta) {
            results.push({ success: false, error: `File not found: ${fileId}` });
            continue;
          }

          // Prepare media buffer or stream
          const mediaBuffer = createReadStream(mediaMeta.storagePath);
          
          // Determine message type based on MIME type
          let messageContent: any;
          if (mediaMeta.mimetype.startsWith('image/')) {
            messageContent = {
              image: mediaBuffer,
              caption: options.caption,
              mimetype: mediaMeta.mimetype,
            };
          } else if (mediaMeta.mimetype.startsWith('video/')) {
            messageContent = {
              video: mediaBuffer,
              caption: options.caption,
              mimetype: mediaMeta.mimetype,
            };
          } else if (mediaMeta.mimetype.startsWith('audio/')) {
            messageContent = {
              audio: mediaBuffer,
              mimetype: mediaMeta.mimetype,
            };
          } else {
            // Send as document
            messageContent = {
              document: mediaBuffer,
              mimetype: mediaMeta.mimetype,
              fileName: mediaMeta.originalName,
              caption: options.caption,
            };
          }

          const result = await this.socket.sendMessage('status@broadcast', messageContent);
          
          results.push({
            success: true,
            messageId: result?.key?.id || undefined,
            sentAt: new Date(),
          });

          // Mark media as permanent (no longer temporary)
          await MediaMetaService.markPermanent(fileId);

        } catch (error) {
          console.error(`Failed to send file ${fileId} to status:`, error);
          results.push({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Update send history
      const overallSuccess = results.some(r => r.success);
      await SendHistoryService.update(sendHistory.id, {
        status: overallSuccess ? 'completed' : 'failed',
        completedAt: new Date(),
        errorMessage: overallSuccess ? undefined : results.find(r => !r.success)?.error,
      });

      return {
        success: overallSuccess,
        messageId: results.find(r => r.success)?.messageId,
        sentAt: new Date(),
      };

    } catch (error) {
      console.error('Status send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send media to specific contact
   */
  async sendToContact(options: SendOptions): Promise<SendResult> {
    try {
      if (!this.socket || !options.targetIdentifier) {
        throw new Error('WhatsApp socket not available or contact identifier missing');
      }

      // Ensure phone number format (add country code if needed)
      const phoneNumber = this.formatPhoneNumber(options.targetIdentifier);
      const contactId = `${phoneNumber}@s.whatsapp.net`;

      // Create send history record
      const sendHistory = await SendHistoryService.create({
        sessionId: options.sessionId,
        targetType: 'contact',
        targetIdentifier: phoneNumber,
        files: options.files,
        status: 'sending',
      });

      const results: SendResult[] = [];

      // Send each file
      for (const fileId of options.files) {
        try {
          const mediaMeta = await MediaMetaService.getById(fileId);
          if (!mediaMeta) {
            results.push({ success: false, error: `File not found: ${fileId}` });
            continue;
          }

          const mediaBuffer = createReadStream(mediaMeta.storagePath);
          
          let messageContent: any;
          if (mediaMeta.mimetype.startsWith('image/')) {
            messageContent = {
              image: mediaBuffer,
              caption: options.caption,
              mimetype: mediaMeta.mimetype,
            };
          } else if (mediaMeta.mimetype.startsWith('video/')) {
            messageContent = {
              video: mediaBuffer,
              caption: options.caption,
              mimetype: mediaMeta.mimetype,
            };
          } else if (mediaMeta.mimetype.startsWith('audio/')) {
            messageContent = {
              audio: mediaBuffer,
              mimetype: mediaMeta.mimetype,
            };
          } else {
            messageContent = {
              document: mediaBuffer,
              mimetype: mediaMeta.mimetype,
              fileName: mediaMeta.originalName,
              caption: options.caption,
            };
          }

          const result = await this.socket.sendMessage(contactId, messageContent);
          
          results.push({
            success: true,
            messageId: result?.key?.id || undefined,
            sentAt: new Date(),
          });

          await MediaMetaService.markPermanent(fileId);

        } catch (error) {
          console.error(`Failed to send file ${fileId} to contact:`, error);
          results.push({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      const overallSuccess = results.some(r => r.success);
      await SendHistoryService.update(sendHistory.id, {
        status: overallSuccess ? 'completed' : 'failed',
        completedAt: new Date(),
        errorMessage: overallSuccess ? undefined : results.find(r => !r.success)?.error,
      });

      return {
        success: overallSuccess,
        messageId: results.find(r => r.success)?.messageId,
        sentAt: new Date(),
      };

    } catch (error) {
      console.error('Contact send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send media to group
   */
  async sendToGroup(options: SendOptions): Promise<SendResult> {
    try {
      if (!this.socket || !options.targetIdentifier) {
        throw new Error('WhatsApp socket not available or group ID missing');
      }

      const groupId = options.targetIdentifier.includes('@g.us') 
        ? options.targetIdentifier 
        : `${options.targetIdentifier}@g.us`;

      // Create send history record
      const sendHistory = await SendHistoryService.create({
        sessionId: options.sessionId,
        targetType: 'group',
        targetIdentifier: groupId,
        files: options.files,
        status: 'sending',
      });

      const results: SendResult[] = [];

      // Send each file
      for (const fileId of options.files) {
        try {
          const mediaMeta = await MediaMetaService.getById(fileId);
          if (!mediaMeta) {
            results.push({ success: false, error: `File not found: ${fileId}` });
            continue;
          }

          const mediaBuffer = createReadStream(mediaMeta.storagePath);
          
          let messageContent: any;
          if (mediaMeta.mimetype.startsWith('image/')) {
            messageContent = {
              image: mediaBuffer,
              caption: options.caption,
              mimetype: mediaMeta.mimetype,
            };
          } else if (mediaMeta.mimetype.startsWith('video/')) {
            messageContent = {
              video: mediaBuffer,
              caption: options.caption,
              mimetype: mediaMeta.mimetype,
            };
          } else if (mediaMeta.mimetype.startsWith('audio/')) {
            messageContent = {
              audio: mediaBuffer,
              mimetype: mediaMeta.mimetype,
            };
          } else {
            messageContent = {
              document: mediaBuffer,
              mimetype: mediaMeta.mimetype,
              fileName: mediaMeta.originalName,
              caption: options.caption,
            };
          }

          const result = await this.socket.sendMessage(groupId, messageContent);
          
          results.push({
            success: true,
            messageId: result?.key?.id || undefined,
            sentAt: new Date(),
          });

          await MediaMetaService.markPermanent(fileId);

        } catch (error) {
          console.error(`Failed to send file ${fileId} to group:`, error);
          results.push({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      const overallSuccess = results.some(r => r.success);
      await SendHistoryService.update(sendHistory.id, {
        status: overallSuccess ? 'completed' : 'failed',
        completedAt: new Date(),
        errorMessage: overallSuccess ? undefined : results.find(r => !r.success)?.error,
      });

      return {
        success: overallSuccess,
        messageId: results.find(r => r.success)?.messageId,
        sentAt: new Date(),
      };

    } catch (error) {
      console.error('Group send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get contacts from WhatsApp
   */
  async getContacts(): Promise<ContactInfo[]> {
    try {
      if (!this.socket) {
        throw new Error('WhatsApp socket not available');
      }

      // Note: Baileys doesn't provide direct contact API
      // This is a simplified implementation
      // In practice, you'd need to track contacts from message history or use other methods
      
      return [];
    } catch (error) {
      console.error('Failed to get contacts:', error);
      return [];
    }
  }

  /**
   * Get groups from WhatsApp
   */
  async getGroups(): Promise<GroupInfo[]> {
    try {
      if (!this.socket) {
        throw new Error('WhatsApp socket not available');
      }

      const groups = await this.socket.groupFetchAllParticipating();
      
      return Object.values(groups).map((group: any) => ({
        id: group.id,
        subject: group.subject,
        description: group.desc,
        participantsCount: group.participants?.length || 0,
        creation: group.creation,
        owner: group.owner,
      }));

    } catch (error) {
      console.error('Failed to get groups:', error);
      return [];
    }
  }

  /**
   * Format phone number for WhatsApp
   */
  private formatPhoneNumber(phone: string): string {
    // Remove any non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Add country code if not present (assuming US/international format)
    if (cleaned.length === 10 && !cleaned.startsWith('1')) {
      cleaned = '1' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Check if contact/group exists and is valid
   */
  async validateTarget(targetType: 'contact' | 'group', targetIdentifier: string): Promise<boolean> {
    try {
      if (targetType === 'contact') {
        const phoneNumber = this.formatPhoneNumber(targetIdentifier);
        const contactId = `${phoneNumber}@s.whatsapp.net`;
        // You could implement contact validation logic here
        return true; // Simplified
      } else if (targetType === 'group') {
        const groups = await this.getGroups();
        return groups.some(g => g.id === targetIdentifier || g.id.includes(targetIdentifier));
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Send message with reliability (queued with retry)
   */
  async sendReliableMessage(options: {
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
    priority?: 'low' | 'normal' | 'high' | 'critical';
    maxRetries?: number;
  }): Promise<string> {
    return await this.reliabilityManager.queueMessage({
      sessionId: options.sessionId,
      targetType: options.targetType,
      targetIdentifier: options.targetIdentifier,
      content: options.content,
      priority: options.priority || 'normal',
      maxRetries: options.maxRetries || 5,
      retryDelay: 5000,
      metadata: { timestamp: new Date().toISOString() }
    });
  }

  /**
   * Get message reliability manager
   */
  getReliabilityManager(): MessageReliabilityManager {
    return this.reliabilityManager;
  }

  /**
   * Get protocol compliance manager
   */
  getProtocolCompliance(): ProtocolCompliance {
    return this.protocolCompliance;
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus() {
    return this.protocolCompliance.getRateLimitStatus();
  }

  /**
   * Get delivery statistics
   */
  getDeliveryStats() {
    return this.reliabilityManager.getDeliveryStats();
  }

  /**
   * Get compliance report
   */
  getComplianceReport() {
    return this.protocolCompliance.getLastComplianceReport();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.reliabilityManager.destroy();
    this.protocolCompliance.destroy();
  }
}
