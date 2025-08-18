import { WASocket, Contact, isJidUser, jidNormalizedUser } from '@whiskeysockets/baileys';
import { EventEmitter } from 'events';
import { ContactRepository, CreateContactData } from '../db/contact';

export interface ExtractedContact {
  id: string;
  name?: string;
  pushName?: string;
  notify?: string;
  verifiedName?: string;
  status?: string;
  phoneNumber?: string;
  isBusiness?: boolean;
  isMyContact?: boolean;
  isBlocked?: boolean;
  profilePicUrl?: string;
  lastSeen?: Date;
}

export interface ContactExtractionResult {
  contacts: ExtractedContact[];
  totalExtracted: number;
  newContacts: number;
  updatedContacts: number;
  errors: ContactExtractionError[];
}

export interface ContactExtractionError {
  contactId: string;
  operation: 'extract' | 'enrich' | 'save';
  error: string;
}

export class ContactExtractionService extends EventEmitter {
  private socket: WASocket;
  private extractedContacts: Map<string, ExtractedContact> = new Map();

  constructor(socket: WASocket) {
    super();
    this.socket = socket;
  }

  /**
   * Extract contacts from chat history and message events
   */
  async extractFromChatHistory(): Promise<ExtractedContact[]> {
    this.emit('extraction_started', { source: 'chat_history' });
    
    try {
      // Since Baileys doesn't have a direct chatHistory method, we'll use the store
      // This is a placeholder - in real implementation, you'd access the chat store
      const contacts: ExtractedContact[] = [];
      
      // Note: This would typically access the socket's chat store or database
      // For now, we'll return empty array and rely on message events
      
      this.emit('extraction_progress', { 
        source: 'chat_history', 
        processed: contacts.length, 
        total: 0 
      });

      return contacts;
    } catch (error) {
      this.emit('extraction_error', { 
        source: 'chat_history', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Extract contacts from message events (real-time)
   */
  async extractFromMessageEvents(): Promise<ExtractedContact[]> {
    this.emit('extraction_started', { source: 'message_events' });
    
    const contacts: ExtractedContact[] = [];
    
    // Listen for incoming messages to extract contact info
    this.socket.ev.on('messages.upsert', async (messageUpdate) => {
      for (const message of messageUpdate.messages) {
        if (message.key.remoteJid && isJidUser(message.key.remoteJid)) {
          const contact = await this.extractContactFromMessage(message);
          if (contact && !this.extractedContacts.has(contact.id)) {
            contacts.push(contact);
            this.extractedContacts.set(contact.id, contact);
            this.emit('contact_discovered', contact);
          }
        }
      }
    });

    return contacts;
  }

  /**
   * Enrich contact data with profile pictures and status
   */
  async enrichContactData(contacts: ExtractedContact[]): Promise<ExtractedContact[]> {
    this.emit('enrichment_started', { count: contacts.length });
    
    const enrichedContacts: ExtractedContact[] = [];
    const errors: ContactExtractionError[] = [];
    
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      
      try {
        const enriched = await this.enrichSingleContact(contact);
        enrichedContacts.push(enriched);
        
        this.emit('enrichment_progress', { 
          processed: i + 1, 
          total: contacts.length,
          contactId: contact.id
        });
        
        // Add small delay to avoid rate limiting
        if (i % 10 === 0 && i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        errors.push({
          contactId: contact.id,
          operation: 'enrich',
          error: error instanceof Error ? error.message : 'Unknown enrichment error'
        });
        
        // Still add the contact without enrichment
        enrichedContacts.push(contact);
      }
    }
    
    if (errors.length > 0) {
      this.emit('enrichment_errors', errors);
    }
    
    this.emit('enrichment_completed', { 
      total: enrichedContacts.length, 
      errors: errors.length 
    });
    
    return enrichedContacts;
  }

  /**
   * Extract and validate phone numbers
   */
  extractPhoneNumber(jid: string): string | undefined {
    try {
      // WhatsApp JIDs are in format: phonenumber@s.whatsapp.net
      const normalized = jidNormalizedUser(jid);
      const phoneNumber = normalized.split('@')[0];
      
      // Basic validation - should be numeric and reasonable length
      if (/^\d{7,15}$/.test(phoneNumber)) {
        return phoneNumber;
      }
      
      return undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Perform full contact extraction and enrichment
   */
  async extractAndEnrichContacts(): Promise<ContactExtractionResult> {
    const startTime = Date.now();
    this.emit('full_extraction_started');
    
    try {
      // Extract from multiple sources
      const [chatContacts, messageContacts] = await Promise.all([
        this.extractFromChatHistory(),
        this.extractFromMessageEvents()
      ]);
      
      // Merge and deduplicate contacts
      const allContacts = this.mergeContacts([...chatContacts, ...messageContacts]);
      
      // Enrich contact data
      const enrichedContacts = await this.enrichContactData(allContacts);
      
      // Save to database
      const saveResult = await this.saveContactsToDatabase(enrichedContacts);
      
      const result: ContactExtractionResult = {
        contacts: enrichedContacts,
        totalExtracted: enrichedContacts.length,
        newContacts: saveResult.newContacts,
        updatedContacts: saveResult.updatedContacts,
        errors: saveResult.errors
      };
      
      const duration = Date.now() - startTime;
      this.emit('full_extraction_completed', { ...result, duration });
      
      return result;
      
    } catch (error) {
      this.emit('full_extraction_failed', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async extractContactFromChat(chat: any): Promise<ExtractedContact | null> {
    try {
      const contactId = jidNormalizedUser(chat.id);
      const phoneNumber = this.extractPhoneNumber(chat.id);
      
      const contact: ExtractedContact = {
        id: contactId,
        name: chat.name,
        phoneNumber,
        isMyContact: false, // Will be determined during enrichment
        isBusiness: false,
        isBlocked: false
      };
      
      return contact;
    } catch (error) {
      return null;
    }
  }

  private async extractContactFromMessage(message: any): Promise<ExtractedContact | null> {
    try {
      const contactId = jidNormalizedUser(message.key.remoteJid);
      const phoneNumber = this.extractPhoneNumber(message.key.remoteJid);
      
      const contact: ExtractedContact = {
        id: contactId,
        pushName: message.pushName,
        phoneNumber,
        isMyContact: false,
        isBusiness: false,
        isBlocked: false
      };
      
      return contact;
    } catch (error) {
      return null;
    }
  }

  private async enrichSingleContact(contact: ExtractedContact): Promise<ExtractedContact> {
    const enriched = { ...contact };
    
    try {
      // Get profile picture URL
      try {
        enriched.profilePicUrl = await this.socket.profilePictureUrl(contact.id, 'image');
      } catch (error) {
        // Contact might not have a profile picture
        enriched.profilePicUrl = undefined;
      }
      
      // Get status message
      try {
        const status = await this.socket.fetchStatus(contact.id);
        if (status && Array.isArray(status) && status.length > 0) {
          const statusInfo = status[0] as any;
          enriched.status = statusInfo?.status;
        }
      } catch (error) {
        // Status might not be available
        enriched.status = undefined;
      }
      
      // Check if contact is in user's phone book
      try {
        const contactInfo = await this.socket.onWhatsApp(contact.id);
        if (contactInfo && contactInfo.length > 0) {
          const info = contactInfo[0] as any;
          enriched.isMyContact = Boolean(info.exists);
          enriched.isBusiness = Boolean(info.isBusiness);
          enriched.verifiedName = info.verifiedName;
        }
      } catch (error) {
        // Contact info might not be available
      }
      
      // Get last seen (if available)
      try {
        const presence = await this.socket.presenceSubscribe(contact.id);
        // Note: Last seen is usually not available due to privacy settings
      } catch (error) {
        // Presence info might not be available
      }
      
    } catch (error) {
      // If enrichment fails, return the original contact
      console.warn(`Failed to enrich contact ${contact.id}:`, error);
    }
    
    return enriched;
  }

  private mergeContacts(contacts: ExtractedContact[]): ExtractedContact[] {
    const contactMap = new Map<string, ExtractedContact>();
    
    for (const contact of contacts) {
      const existing = contactMap.get(contact.id);
      
      if (existing) {
        // Merge contact data, preferring non-null values
        const merged: ExtractedContact = {
          ...existing,
          name: contact.name || existing.name,
          pushName: contact.pushName || existing.pushName,
          notify: contact.notify || existing.notify,
          verifiedName: contact.verifiedName || existing.verifiedName,
          status: contact.status || existing.status,
          phoneNumber: contact.phoneNumber || existing.phoneNumber,
          profilePicUrl: contact.profilePicUrl || existing.profilePicUrl,
          isBusiness: contact.isBusiness || existing.isBusiness,
          isMyContact: contact.isMyContact || existing.isMyContact,
          isBlocked: contact.isBlocked || existing.isBlocked,
          lastSeen: contact.lastSeen || existing.lastSeen
        };
        
        contactMap.set(contact.id, merged);
      } else {
        contactMap.set(contact.id, contact);
      }
    }
    
    return Array.from(contactMap.values());
  }

  private async saveContactsToDatabase(contacts: ExtractedContact[]): Promise<{
    newContacts: number;
    updatedContacts: number;
    errors: ContactExtractionError[];
  }> {
    let newContacts = 0;
    let updatedContacts = 0;
    const errors: ContactExtractionError[] = [];
    
    for (const contact of contacts) {
      try {
        const existingContact = await ContactRepository.findById(contact.id);
        
        const contactData: CreateContactData = {
          id: contact.id,
          name: contact.name,
          pushName: contact.pushName,
          notify: contact.notify,
          verifiedName: contact.verifiedName,
          status: contact.status,
          phoneNumber: contact.phoneNumber,
          isBusiness: contact.isBusiness || false,
          isMyContact: contact.isMyContact || false,
          isBlocked: contact.isBlocked || false,
          isActive: true,
          isFavorite: existingContact?.isFavorite || false, // Preserve favorite status
          profilePicUrl: contact.profilePicUrl,
          lastSeen: contact.lastSeen
        };
        
        await ContactRepository.upsert(contactData);
        
        if (existingContact) {
          updatedContacts++;
        } else {
          newContacts++;
        }
        
      } catch (error) {
        errors.push({
          contactId: contact.id,
          operation: 'save',
          error: error instanceof Error ? error.message : 'Unknown save error'
        });
      }
    }
    
    return { newContacts, updatedContacts, errors };
  }
}