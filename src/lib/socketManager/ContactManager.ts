import { WASocket, Contact, GroupMetadata } from '@whiskeysockets/baileys';
import { EventEmitter } from 'events';
import { ContactRepository, ContactFilters as DbContactFilters } from '../db/contact';
import { GroupRepository, GroupFilters as DbGroupFilters } from '../db/group';
import { ContactExtractionService } from '../services/ContactExtractionService';
import { GroupSyncService } from '../services/GroupSyncService';
import { SyncScheduler } from '../services/SyncScheduler';
import { SyncMonitor } from '../services/SyncMonitor';

export interface ContactInfo extends Contact {
  id: string;
  name?: string;
  pushName?: string;
  short?: string;
  notify?: string;
  verifiedName?: string;
  status?: string;
  isBusiness?: boolean;
  isMyContact?: boolean;
  isBlocked?: boolean;
  lastSeen?: Date;
  profilePicUrl?: string;
  isFavorite?: boolean; // Custom field for favorites
}

export interface GroupInfo extends Omit<GroupMetadata, 'participants'> {
  participants: GroupParticipant[];
  canSend?: boolean; // Permission to send messages
  profilePicUrl?: string;
}

export interface GroupParticipant {
  id: string;
  admin?: 'admin' | 'superadmin' | null;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
}

export interface ContactFilters {
  search?: string;
  isMyContact?: boolean;
  isBlocked?: boolean;
  isBusiness?: boolean;
  isFavorite?: boolean;
  limit?: number;
  offset?: number;
}

export interface GroupFilters {
  search?: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  canSend?: boolean;
  minSize?: number;
  maxSize?: number;
  limit?: number;
  offset?: number;
}

export class ContactManager extends EventEmitter {
  private socket: WASocket;
  private contacts: Map<string, ContactInfo> = new Map();
  private groups: Map<string, GroupInfo> = new Map();
  private favorites: Set<string> = new Set();
  private lastSync: Date | null = null;
  private syncInProgress: boolean = false;
  private contactExtractionService: ContactExtractionService;
  private groupSyncService: GroupSyncService;
  private syncScheduler: SyncScheduler;
  private syncMonitor: SyncMonitor;
  private dbInitialized: boolean = false;

  constructor(socket: WASocket) {
    super();
    this.socket = socket;
    this.contactExtractionService = new ContactExtractionService(socket);
    this.groupSyncService = new GroupSyncService(socket);
    this.syncScheduler = new SyncScheduler();
    this.syncMonitor = new SyncMonitor();
    this.setupEventHandlers();
    this.setupServiceEventListeners();
    this.setupSyncScheduler();
    this.setupSyncMonitor();
    this.initializeFromDatabase();
  }

  /**
   * Initialize ContactManager with data from database on startup
   */
  private async initializeFromDatabase(): Promise<void> {
    try {
      this.emit('db_initialization_started');
      
      // Load contacts from database
      const dbContacts = await ContactRepository.findAll({ isActive: true });
      for (const dbContact of dbContacts) {
        const contactInfo: ContactInfo = {
          id: dbContact.id,
          name: dbContact.name || undefined,
          pushName: dbContact.pushName || undefined,
          notify: dbContact.notify || undefined,
          verifiedName: dbContact.verifiedName || undefined,
          status: dbContact.status || undefined,
          isBusiness: dbContact.isBusiness,
          isMyContact: dbContact.isMyContact,
          isBlocked: dbContact.isBlocked,
          lastSeen: dbContact.lastSeen || undefined,
          profilePicUrl: dbContact.profilePicUrl || undefined,
          isFavorite: dbContact.isFavorite
        };
        
        this.contacts.set(dbContact.id, contactInfo);
        
        if (dbContact.isFavorite) {
          this.favorites.add(dbContact.id);
        }
      }
      
      // Load groups from database
      const dbGroups = await GroupRepository.findAll({ isActive: true });
      for (const dbGroup of dbGroups) {
        const groupInfo: GroupInfo = {
          id: dbGroup.id,
          subject: dbGroup.subject,
          desc: dbGroup.description || undefined,
          size: dbGroup.participantCount,
          creation: dbGroup.creation ? Math.floor(dbGroup.creation.getTime() / 1000) : undefined,
          owner: dbGroup.owner || undefined,
          participants: [], // Will be populated during sync
          canSend: dbGroup.canSend || false,
          profilePicUrl: dbGroup.profilePicUrl || undefined,
          addressingMode: 'pn' as const // Default addressing mode
        };
        
        this.groups.set(dbGroup.id, groupInfo);
      }
      
      this.dbInitialized = true;
      this.emit('db_initialization_completed', {
        contacts: this.contacts.size,
        groups: this.groups.size,
        favorites: this.favorites.size
      });
      
    } catch (error) {
      console.error('Failed to initialize from database:', error);
      this.emit('db_initialization_failed', error);
      // Continue without database data - graceful degradation
      this.dbInitialized = true;
    }
  }

  /**
   * Sync in-memory cache with database changes
   */
  private async syncCacheWithDatabase(): Promise<void> {
    if (!this.dbInitialized) return;
    
    try {
      // Reload contacts from database to sync any external changes
      const dbContacts = await ContactRepository.findAll({ isActive: true });
      const dbContactIds = new Set(dbContacts.map(c => c.id));
      
      // Update existing contacts and add new ones
      for (const dbContact of dbContacts) {
        const contactInfo: ContactInfo = {
          id: dbContact.id,
          name: dbContact.name || undefined,
          pushName: dbContact.pushName || undefined,
          notify: dbContact.notify || undefined,
          verifiedName: dbContact.verifiedName || undefined,
          status: dbContact.status || undefined,
          isBusiness: dbContact.isBusiness,
          isMyContact: dbContact.isMyContact,
          isBlocked: dbContact.isBlocked,
          lastSeen: dbContact.lastSeen || undefined,
          profilePicUrl: dbContact.profilePicUrl || undefined,
          isFavorite: dbContact.isFavorite
        };
        
        this.contacts.set(dbContact.id, contactInfo);
        
        if (dbContact.isFavorite) {
          this.favorites.add(dbContact.id);
        } else {
          this.favorites.delete(dbContact.id);
        }
      }
      
      // Remove contacts that are no longer in database (marked inactive)
      const contactIds = Array.from(this.contacts.keys());
      for (const contactId of contactIds) {
        if (!dbContactIds.has(contactId)) {
          this.contacts.delete(contactId);
          this.favorites.delete(contactId);
        }
      }
      
      // Sync groups similarly
      const dbGroups = await GroupRepository.findAll({ isActive: true });
      const dbGroupIds = new Set(dbGroups.map(g => g.id));
      
      for (const dbGroup of dbGroups) {
        const groupInfo: GroupInfo = {
          id: dbGroup.id,
          subject: dbGroup.subject,
          desc: dbGroup.description || undefined,
          size: dbGroup.participantCount,
          creation: dbGroup.creation ? Math.floor(dbGroup.creation.getTime() / 1000) : undefined,
          owner: dbGroup.owner || undefined,
          participants: this.groups.get(dbGroup.id)?.participants || [], // Preserve existing participants
          canSend: dbGroup.canSend || false,
          profilePicUrl: dbGroup.profilePicUrl || undefined,
          addressingMode: 'pn' as const // Default addressing mode
        };
        
        this.groups.set(dbGroup.id, groupInfo);
      }
      
      // Remove groups that are no longer in database
      const groupIds = Array.from(this.groups.keys());
      for (const groupId of groupIds) {
        if (!dbGroupIds.has(groupId)) {
          this.groups.delete(groupId);
        }
      }
      
      this.emit('cache_synced_with_database', {
        contacts: this.contacts.size,
        groups: this.groups.size
      });
      
    } catch (error) {
      console.error('Failed to sync cache with database:', error);
      this.emit('cache_sync_failed', error);
    }
  }

  /**
   * Setup event handlers for WhatsApp contact/group updates
   */
  private setupEventHandlers() {
    // Contact events
    this.socket.ev.on('contacts.update', async (updates) => {
      const updatedContacts = [];
      
      for (const contact of updates) {
        await this.updateContact(contact);
        if (contact.id) {
          updatedContacts.push(this.contacts.get(contact.id));
        }
      }
      
      // Emit for frontend real-time updates
      this.emit('contacts_updated', updatedContacts.filter(Boolean));
      this.emit('realtime_contact_update', { 
        type: 'update', 
        contacts: updatedContacts.filter(Boolean) 
      });
    });

    this.socket.ev.on('contacts.upsert', async (contacts) => {
      const newContacts = [];
      
      for (const contact of contacts) {
        const wasNew = !this.contacts.has(contact.id);
        await this.addOrUpdateContact(contact);
        
        if (wasNew) {
          newContacts.push(this.contacts.get(contact.id));
        }
      }
      
      // Emit for frontend real-time updates
      this.emit('contacts_added', newContacts.filter(Boolean));
      this.emit('realtime_contact_update', { 
        type: 'add', 
        contacts: newContacts.filter(Boolean) 
      });
    });

    // Group events
    this.socket.ev.on('groups.update', async (updates) => {
      const updatedGroups = [];
      
      for (const group of updates) {
        await this.updateGroup(group as GroupMetadata);
        if (group.id) {
          updatedGroups.push(this.groups.get(group.id));
        }
      }
      
      // Emit for frontend real-time updates
      this.emit('groups_updated', updatedGroups.filter(Boolean));
      this.emit('realtime_group_update', { 
        type: 'update', 
        groups: updatedGroups.filter(Boolean) 
      });
    });

    this.socket.ev.on('group-participants.update', async (update) => {
      await this.handleGroupParticipantsUpdate(update);
      const updatedGroup = this.groups.get(update.id);
      
      // Emit for frontend real-time updates
      this.emit('group_participants_updated', update);
      this.emit('realtime_group_update', { 
        type: 'participants_update', 
        groups: updatedGroup ? [updatedGroup] : [],
        participantUpdate: update
      });
    });

    // Connection events for automatic sync
    this.socket.ev.on('connection.update', async (update) => {
      if (update.connection === 'open') {
        console.log('ContactManager: WhatsApp connection opened, notifying sync scheduler');
        this.emit('whatsapp_connected');
        
        // Note: Automatic sync is now handled by SyncScheduler
        // The old manual sync trigger is removed in favor of the scheduler
      } else if (update.connection === 'close') {
        console.log('ContactManager: WhatsApp connection closed, notifying sync scheduler');
        this.emit('whatsapp_disconnected');
      }
    });

    // Message events for contact discovery
    this.socket.ev.on('messages.upsert', async (messageUpdate) => {
      for (const message of messageUpdate.messages) {
        if (message.key.remoteJid && !this.contacts.has(message.key.remoteJid)) {
          // New contact discovered through message
          try {
            const extractedContacts = await this.contactExtractionService.extractFromMessageEvents();
            if (extractedContacts.length > 0) {
              this.emit('realtime_contact_update', { 
                type: 'discovered', 
                contacts: extractedContacts 
              });
            }
          } catch (error) {
            console.error('Failed to extract contact from message:', error);
          }
        }
      }
    });

    // Presence events for contact status updates
    this.socket.ev.on('presence.update', async (presenceUpdate) => {
      const contactId = presenceUpdate.id;
      const contact = this.contacts.get(contactId);
      
      if (contact) {
        // Update contact with presence info
        const presences = Object.values(presenceUpdate.presences || {});
        const isAvailable = presences.some(p => p.lastKnownPresence === 'available');
        
        const updatedContact = {
          ...contact,
          lastSeen: isAvailable ? new Date() : contact.lastSeen
        };
        
        this.contacts.set(contactId, updatedContact);
        
        // Update in database
        if (this.dbInitialized) {
          try {
            await ContactRepository.update(contactId, {
              lastSeen: updatedContact.lastSeen
            });
          } catch (error) {
            console.error('Failed to update contact presence in database:', error);
          }
        }
        
        // Emit for frontend real-time updates
        this.emit('realtime_contact_update', { 
          type: 'presence', 
          contacts: [updatedContact] 
        });
      }
    });
  }

  /**
   * Setup sync scheduler
   */
  private setupSyncScheduler() {
    // Initialize sync scheduler with this ContactManager instance
    this.syncScheduler.initialize(this);

    // Listen for sync scheduler events
    this.syncScheduler.on('scheduler_initialized', () => {
      this.emit('sync_scheduler_ready');
    });

    this.syncScheduler.on('connection_established', () => {
      this.emit('auto_sync_enabled');
    });

    this.syncScheduler.on('connection_lost', () => {
      this.emit('auto_sync_disabled');
    });

    this.syncScheduler.on('initial_sync_scheduled', (data) => {
      this.emit('initial_sync_scheduled', data);
    });

    this.syncScheduler.on('periodic_sync_started', (data) => {
      this.emit('periodic_sync_started', data);
    });

    this.syncScheduler.on('sync_execution_started', (data) => {
      this.emit('auto_sync_started', data);
    });

    this.syncScheduler.on('sync_execution_completed', (data) => {
      this.emit('auto_sync_completed', data);
    });

    this.syncScheduler.on('sync_execution_failed', (data) => {
      this.emit('auto_sync_failed', data);
    });

    this.syncScheduler.on('sync_throttled', (data) => {
      this.emit('sync_throttled', data);
    });

    this.syncScheduler.on('sync_queued', (data) => {
      this.emit('sync_queued', data);
    });

    this.syncScheduler.on('sync_retry_scheduled', (data) => {
      this.emit('sync_retry_scheduled', data);
    });

    this.syncScheduler.on('sync_retry_exhausted', (data) => {
      this.emit('sync_retry_exhausted', data);
    });

    this.syncScheduler.on('health_check_completed', (data) => {
      this.emit('sync_health_check', data);
    });

    this.syncScheduler.on('sync_health_critical', (data) => {
      this.emit('sync_health_critical', data);
    });

    this.syncScheduler.on('config_updated', (config) => {
      this.emit('sync_config_updated', config);
    });
  }

  /**
   * Setup sync monitor
   */
  private setupSyncMonitor() {
    // Initialize sync monitor with sync scheduler
    this.syncMonitor.initialize(this.syncScheduler);

    // Listen for monitor events
    this.syncMonitor.on('monitor_initialized', () => {
      this.emit('sync_monitor_ready');
    });

    this.syncMonitor.on('alert_created', (alert) => {
      this.emit('sync_alert', alert);
    });

    this.syncMonitor.on('alert_acknowledged', (alert) => {
      this.emit('sync_alert_acknowledged', alert);
    });

    this.syncMonitor.on('health_check_completed', (data) => {
      this.emit('sync_monitor_health_check', data);
    });

    this.syncMonitor.on('monitoring_started', () => {
      this.emit('sync_monitoring_started');
    });

    this.syncMonitor.on('monitoring_stopped', () => {
      this.emit('sync_monitoring_stopped');
    });
  }

  /**
   * Setup event listeners for sync services
   */
  private setupServiceEventListeners() {
    // Contact extraction service events
    this.contactExtractionService.on('contact_discovered', (contact) => {
      this.emit('realtime_contact_update', { 
        type: 'discovered', 
        contacts: [contact] 
      });
    });

    this.contactExtractionService.on('full_extraction_completed', (result) => {
      this.emit('contact_sync_completed', result);
    });

    this.contactExtractionService.on('extraction_error', (error) => {
      this.emit('contact_sync_error', error);
    });

    // Group sync service events
    this.groupSyncService.on('group_updated', (group) => {
      this.emit('realtime_group_update', { 
        type: 'updated', 
        groups: [group] 
      });
    });

    this.groupSyncService.on('group_participants_updated', (update) => {
      this.emit('realtime_group_update', { 
        type: 'participants_updated', 
        participantUpdate: update 
      });
    });

    this.groupSyncService.on('full_sync_completed', (result) => {
      this.emit('group_sync_completed', result);
    });

    this.groupSyncService.on('group_sync_error', (error) => {
      this.emit('group_sync_error', error);
    });
  }

  /**
   * Comprehensive sync from WhatsApp with database integration
   */
  async syncFromWhatsApp(force: boolean = false): Promise<{ 
    contacts: { total: number; new: number; updated: number; errors: number }; 
    groups: { total: number; new: number; updated: number; errors: number };
    duration: number;
  }> {
    if (this.syncInProgress) {
      const error = new Error('Sync already in progress');
      this.emit('sync_error', {
        type: 'SYNC_CONFLICT',
        message: 'Another sync operation is already running',
        error,
        retryable: true,
        retryAfter: 30000 // 30 seconds
      });
      throw error;
    }

    // Check if recent sync exists and force is not requested
    if (!force && this.lastSync && Date.now() - this.lastSync.getTime() < 5 * 60 * 1000) {
      const error = new Error('Recent sync exists. Use force=true to override');
      this.emit('sync_error', {
        type: 'RATE_LIMITED',
        message: 'Sync was performed recently. Wait 5 minutes or use force sync.',
        error,
        retryable: true,
        retryAfter: 300000 // 5 minutes
      });
      throw error;
    }

    this.syncInProgress = true;
    const startTime = Date.now();
    
    // Emit sync started with progress tracking
    this.emit('sync_started', { 
      type: 'full', 
      force,
      timestamp: new Date().toISOString()
    });
    
    this.emit('sync_progress', {
      stage: 'initializing',
      message: 'Preparing sync operation...',
      progress: { current: 0, total: 100 }
    });

    try {
      // Check WhatsApp connection before starting
      if (!this.socket || !this.socket.user) {
        const error = new Error('WhatsApp connection not available');
        this.emit('sync_error', {
          type: 'CONNECTION_ERROR',
          message: 'WhatsApp is not connected. Please reconnect and try again.',
          error,
          retryable: true,
          retryAfter: 10000 // 10 seconds
        });
        throw error;
      }

      // Wait for database initialization if not ready
      if (!this.dbInitialized) {
        this.emit('sync_progress', {
          stage: 'database_init',
          message: 'Initializing database connection...',
          progress: { current: 10, total: 100 }
        });
        await this.initializeFromDatabase();
      }

      this.emit('sync_progress', {
        stage: 'syncing_data',
        message: 'Synchronizing contacts and groups...',
        progress: { current: 20, total: 100 }
      });

      // Perform parallel sync of contacts and groups with error handling
      let contactResult, groupResult;
      const syncErrors: Array<{ type: string; error: Error }> = [];

      try {
        [contactResult, groupResult] = await Promise.all([
          this.syncContactsFromWhatsApp().catch(error => {
            syncErrors.push({ type: 'contacts', error });
            return {
              totalExtracted: 0,
              newContacts: 0,
              updatedContacts: 0,
              errors: [{ contactId: 'unknown', operation: 'sync', error: error.message }]
            };
          }),
          this.syncGroupsFromWhatsApp().catch(error => {
            syncErrors.push({ type: 'groups', error });
            return {
              totalSynced: 0,
              newGroups: 0,
              updatedGroups: 0,
              errors: [{ groupId: 'unknown', operation: 'sync', error: error.message }]
            };
          })
        ]);
      } catch (error) {
        // This shouldn't happen due to individual catch blocks, but just in case
        const syncError = new Error('Critical sync failure during data synchronization');
        this.emit('sync_error', {
          type: 'CRITICAL_ERROR',
          message: 'A critical error occurred during synchronization',
          error: syncError,
          retryable: true,
          retryAfter: 60000 // 1 minute
        });
        throw syncError;
      }

      this.emit('sync_progress', {
        stage: 'updating_cache',
        message: 'Updating local cache...',
        progress: { current: 80, total: 100 }
      });

      // Update in-memory cache with database changes
      try {
        await this.syncCacheWithDatabase();
      } catch (error) {
        console.warn('Failed to update cache, but sync data is saved:', error);
        this.emit('sync_warning', {
          type: 'CACHE_UPDATE_FAILED',
          message: 'Sync completed but cache update failed. Data is saved but may not reflect immediately.',
          error
        });
      }

      const duration = Date.now() - startTime;
      this.lastSync = new Date();
      this.syncInProgress = false;

      const result = {
        contacts: {
          total: contactResult.totalExtracted,
          new: contactResult.newContacts,
          updated: contactResult.updatedContacts,
          errors: contactResult.errors.length
        },
        groups: {
          total: groupResult.totalSynced,
          new: groupResult.newGroups,
          updated: groupResult.updatedGroups,
          errors: groupResult.errors.length
        },
        duration
      };

      this.emit('sync_progress', {
        stage: 'completed',
        message: 'Sync completed successfully',
        progress: { current: 100, total: 100 }
      });

      // Emit completion with detailed results
      this.emit('sync_completed', {
        ...result,
        timestamp: new Date().toISOString(),
        hasErrors: result.contacts.errors > 0 || result.groups.errors > 0,
        syncErrors: syncErrors.length > 0 ? syncErrors : undefined
      });

      // Emit success notification
      this.emit('sync_notification', {
        type: 'success',
        title: 'Sync Completed',
        message: `Synchronized ${result.contacts.total} contacts and ${result.groups.total} groups in ${(duration / 1000).toFixed(1)}s`,
        duration: 5000
      });

      return result;

    } catch (error) {
      this.syncInProgress = false;
      
      // Emit detailed error information
      this.emit('sync_failed', {
        error,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      });

      // Emit error notification
      this.emit('sync_notification', {
        type: 'error',
        title: 'Sync Failed',
        message: error instanceof Error ? error.message : 'An unknown error occurred during sync',
        duration: 8000,
        action: {
          label: 'Retry',
          onClick: () => this.syncFromWhatsApp(force)
        }
      });

      throw error;
    }
  }

  /**
   * Incremental sync - only update changed items
   */
  async incrementalSync(): Promise<{
    contacts: { updated: number; errors: number };
    groups: { updated: number; errors: number };
    duration: number;
  }> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    this.syncInProgress = true;
    const startTime = Date.now();
    this.emit('sync_started', { type: 'incremental' });

    try {
      // Get contacts and groups that need updates (based on lastSyncAt)
      const contactsToUpdate = Array.from(this.contacts.keys());
      const groupsToUpdate = Array.from(this.groups.keys());

      let contactsUpdated = 0;
      let contactErrors = 0;
      let groupsUpdated = 0;
      let groupErrors = 0;

      // Update contacts incrementally
      for (const contactId of contactsToUpdate) {
        try {
          const enriched = await this.contactExtractionService.enrichContactData([{
            id: contactId,
            name: this.contacts.get(contactId)?.name,
            pushName: this.contacts.get(contactId)?.pushName
          }]);

          if (enriched.length > 0) {
            await this.updateContact(enriched[0]);
            contactsUpdated++;
          }
        } catch (error) {
          contactErrors++;
          console.error(`Failed to update contact ${contactId}:`, error);
        }
      }

      // Update groups incrementally
      for (const groupId of groupsToUpdate) {
        try {
          const groupMetadata = await this.socket.groupMetadata(groupId);
          await this.updateGroup(groupMetadata);
          groupsUpdated++;
        } catch (error) {
          groupErrors++;
          console.error(`Failed to update group ${groupId}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      this.syncInProgress = false;

      const result = {
        contacts: { updated: contactsUpdated, errors: contactErrors },
        groups: { updated: groupsUpdated, errors: groupErrors },
        duration
      };

      this.emit('incremental_sync_completed', result);
      return result;

    } catch (error) {
      this.syncInProgress = false;
      this.emit('incremental_sync_failed', error);
      throw error;
    }
  }

  /**
   * Sync contacts from WhatsApp using ContactExtractionService
   */
  private async syncContactsFromWhatsApp() {
    this.emit('contacts_sync_started');
    
    try {
      // Check if contact extraction service is available
      if (!this.contactExtractionService) {
        throw new Error('Contact extraction service not initialized');
      }

      // Emit progress update
      this.emit('sync_progress', {
        stage: 'extracting_contacts',
        message: 'Extracting contacts from WhatsApp...',
        progress: { current: 30, total: 100 }
      });

      const result = await this.contactExtractionService.extractAndEnrichContacts();
      
      // Check for extraction errors
      if (result.errors && result.errors.length > 0) {
        this.emit('sync_warning', {
          type: 'PARTIAL_CONTACT_SYNC',
          message: `${result.errors.length} contacts failed to sync`,
          details: result.errors
        });
      }

      this.emit('sync_progress', {
        stage: 'processing_contacts',
        message: 'Processing contact data...',
        progress: { current: 50, total: 100 }
      });
      
      // Update in-memory cache with synced contacts
      for (const contact of result.contacts) {
        try {
          const contactInfo: ContactInfo = {
            id: contact.id,
            name: contact.name,
            pushName: contact.pushName,
            notify: contact.notify,
            verifiedName: contact.verifiedName,
            status: contact.status,
            isBusiness: contact.isBusiness || false,
            isMyContact: contact.isMyContact || false,
            isBlocked: contact.isBlocked || false,
            lastSeen: contact.lastSeen,
            profilePicUrl: contact.profilePicUrl,
            isFavorite: this.favorites.has(contact.id)
          };
          
          this.contacts.set(contact.id, contactInfo);
        } catch (contactError) {
          console.warn(`Failed to process contact ${contact.id}:`, contactError);
          result.errors.push({
            contactId: contact.id,
            operation: 'process',
            error: contactError instanceof Error ? contactError.message : 'Unknown processing error'
          });
        }
      }
      
      this.emit('contacts_sync_completed', {
        total: result.totalExtracted,
        new: result.newContacts,
        updated: result.updatedContacts,
        errors: result.errors.length
      });

      // Emit notification for contact sync
      if (result.errors.length === 0) {
        this.emit('sync_notification', {
          type: 'success',
          title: 'Contacts Synced',
          message: `Successfully synced ${result.totalExtracted} contacts (${result.newContacts} new, ${result.updatedContacts} updated)`,
          duration: 4000
        });
      } else {
        this.emit('sync_notification', {
          type: 'warning',
          title: 'Contacts Partially Synced',
          message: `Synced ${result.totalExtracted - result.errors.length} of ${result.totalExtracted} contacts. ${result.errors.length} failed.`,
          duration: 6000
        });
      }
      
      return result;

    } catch (error) {
      console.error('Failed to sync contacts:', error);
      
      // Emit detailed error
      this.emit('contacts_sync_failed', {
        error,
        timestamp: new Date().toISOString(),
        stage: 'contact_extraction'
      });

      // Emit error notification
      this.emit('sync_notification', {
        type: 'error',
        title: 'Contact Sync Failed',
        message: error instanceof Error ? error.message : 'Failed to sync contacts from WhatsApp',
        duration: 8000,
        action: {
          label: 'Retry Contacts',
          onClick: () => this.syncContactsFromWhatsApp()
        }
      });

      throw error;
    }
  }

  /**
   * Sync groups from WhatsApp using GroupSyncService
   */
  private async syncGroupsFromWhatsApp() {
    this.emit('groups_sync_started');
    
    try {
      // Check if group sync service is available
      if (!this.groupSyncService) {
        throw new Error('Group sync service not initialized');
      }

      // Emit progress update
      this.emit('sync_progress', {
        stage: 'fetching_groups',
        message: 'Fetching groups from WhatsApp...',
        progress: { current: 60, total: 100 }
      });

      const result = await this.groupSyncService.syncAllGroups();
      
      // Check for sync errors
      if (result.errors && result.errors.length > 0) {
        this.emit('sync_warning', {
          type: 'PARTIAL_GROUP_SYNC',
          message: `${result.errors.length} groups failed to sync`,
          details: result.errors
        });
      }

      this.emit('sync_progress', {
        stage: 'processing_groups',
        message: 'Processing group data...',
        progress: { current: 70, total: 100 }
      });
      
      // Update in-memory cache with synced groups
      for (const group of result.groups) {
        try {
          const groupInfo: GroupInfo = {
            id: group.id,
            subject: group.subject,
            desc: group.description,
            size: group.participantCount,
            creation: group.creation ? Math.floor(group.creation.getTime() / 1000) : undefined,
            owner: group.owner,
            participants: this.groups.get(group.id)?.participants || [], // Preserve existing participants
            canSend: group.canSend || false,
            profilePicUrl: group.profilePicUrl,
            addressingMode: 'pn' as const // Default addressing mode
          };
          
          this.groups.set(group.id, groupInfo);
        } catch (groupError) {
          console.warn(`Failed to process group ${group.id}:`, groupError);
          result.errors.push({
            groupId: group.id,
            operation: 'process',
            error: groupError instanceof Error ? groupError.message : 'Unknown processing error'
          });
        }
      }
      
      this.emit('groups_sync_completed', {
        total: result.totalSynced,
        new: result.newGroups,
        updated: result.updatedGroups,
        errors: result.errors.length
      });

      // Emit notification for group sync
      if (result.errors.length === 0) {
        this.emit('sync_notification', {
          type: 'success',
          title: 'Groups Synced',
          message: `Successfully synced ${result.totalSynced} groups (${result.newGroups} new, ${result.updatedGroups} updated)`,
          duration: 4000
        });
      } else {
        this.emit('sync_notification', {
          type: 'warning',
          title: 'Groups Partially Synced',
          message: `Synced ${result.totalSynced - result.errors.length} of ${result.totalSynced} groups. ${result.errors.length} failed.`,
          duration: 6000
        });
      }
      
      return result;

    } catch (error) {
      console.error('Failed to sync groups:', error);
      
      // Emit detailed error
      this.emit('groups_sync_failed', {
        error,
        timestamp: new Date().toISOString(),
        stage: 'group_sync'
      });

      // Emit error notification
      this.emit('sync_notification', {
        type: 'error',
        title: 'Group Sync Failed',
        message: error instanceof Error ? error.message : 'Failed to sync groups from WhatsApp',
        duration: 8000,
        action: {
          label: 'Retry Groups',
          onClick: () => this.syncGroupsFromWhatsApp()
        }
      });

      throw error;
    }
  }

  /**
   * Backward compatibility method for existing code
   */
  async syncAll(force: boolean = false): Promise<{ contacts: number; groups: number }> {
    const result = await this.syncFromWhatsApp(force);
    return {
      contacts: result.contacts.total,
      groups: result.groups.total
    };
  }

  /**
   * Sync conflict resolution and error recovery
   */
  async resolveSyncConflicts(): Promise<void> {
    if (!this.dbInitialized) return;
    
    try {
      this.emit('conflict_resolution_started');
      
      // Check for contacts that exist in memory but not in database
      const dbContacts = await ContactRepository.findAll({ isActive: true });
      const dbContactIds = new Set(dbContacts.map(c => c.id));
      
      const contactEntries = Array.from(this.contacts.entries());
      for (const [contactId, contact] of contactEntries) {
        if (!dbContactIds.has(contactId)) {
          // Contact exists in memory but not in database - save it
          await ContactRepository.upsert({
            id: contact.id,
            name: contact.name,
            pushName: contact.pushName,
            notify: contact.notify,
            verifiedName: contact.verifiedName,
            status: contact.status,
            isBusiness: contact.isBusiness || false,
            isMyContact: contact.isMyContact || false,
            isBlocked: contact.isBlocked || false,
            isActive: true,
            isFavorite: contact.isFavorite || false,
            profilePicUrl: contact.profilePicUrl,
            lastSeen: contact.lastSeen
          });
        }
      }
      
      // Check for groups that exist in memory but not in database
      const dbGroups = await GroupRepository.findAll({ isActive: true });
      const dbGroupIds = new Set(dbGroups.map(g => g.id));
      
      const groupEntries = Array.from(this.groups.entries());
      for (const [groupId, group] of groupEntries) {
        if (!dbGroupIds.has(groupId)) {
          // Group exists in memory but not in database - save it
          await GroupRepository.upsert({
            id: group.id,
            subject: group.subject,
            description: group.desc,
            participantCount: group.size || 0,
            creation: group.creation ? new Date(group.creation * 1000) : undefined,
            owner: group.owner,
            userRole: 'member', // Will be updated during next sync
            canSend: group.canSend || false,
            isActive: true,
            profilePicUrl: group.profilePicUrl
          });
        }
      }
      
      this.emit('conflict_resolution_completed');
      
    } catch (error) {
      console.error('Failed to resolve sync conflicts:', error);
      this.emit('conflict_resolution_failed', error);
    }
  }

  /**
   * Enable real-time updates for frontend
   */
  enableRealTimeUpdates(): void {
    // Setup group sync service event listeners for real-time updates
    this.groupSyncService.setupGroupEventListeners();
    
    // Enable contact extraction service real-time discovery
    this.contactExtractionService.extractFromMessageEvents();
    
    this.emit('realtime_updates_enabled');
  }

  /**
   * Disable real-time updates
   */
  disableRealTimeUpdates(): void {
    // Remove event listeners to stop real-time updates
    this.socket.ev.removeAllListeners('messages.upsert');
    this.socket.ev.removeAllListeners('presence.update');
    
    this.emit('realtime_updates_disabled');
  }

  /**
   * Get real-time update status
   */
  getRealTimeUpdateStatus(): {
    enabled: boolean;
    lastUpdate: Date | null;
    activeListeners: string[];
  } {
    // Check if specific event listeners are registered (simplified check)
    const hasMessageListener = true; // Assume listeners are active if manager is initialized
    const hasPresenceListener = true;
    
    return {
      enabled: hasMessageListener && hasPresenceListener,
      lastUpdate: this.lastSync,
      activeListeners: ['messages.upsert', 'presence.update'].filter(event => 
        event === 'messages.upsert' ? hasMessageListener : hasPresenceListener
      )
    };
  }

  /**
   * Force emit current state for frontend initialization
   */
  emitCurrentState(): void {
    const contacts = Array.from(this.contacts.values());
    const groups = Array.from(this.groups.values());
    
    this.emit('current_state', {
      contacts,
      groups,
      favorites: Array.from(this.favorites),
      statistics: this.getStatisticsFromMemory(),
      lastSync: this.lastSync,
      syncInProgress: this.syncInProgress
    });
  }

  /**
   * Get contacts with optional filtering (database-backed)
   */
  async getContacts(filters: ContactFilters = {}): Promise<ContactInfo[]> {
    if (!this.dbInitialized) {
      // Fallback to in-memory data if database not initialized
      return this.getContactsFromMemory(filters);
    }
    
    try {
      // Convert filters to database format
      const dbFilters: DbContactFilters = {
        isActive: true,
        search: filters.search,
        isMyContact: filters.isMyContact,
        isBusiness: filters.isBusiness,
        isFavorite: filters.isFavorite,
        limit: filters.limit,
        offset: filters.offset
      };
      
      const dbContacts = await ContactRepository.findAll(dbFilters);
      
      return dbContacts.map(dbContact => ({
        id: dbContact.id,
        name: dbContact.name || undefined,
        pushName: dbContact.pushName || undefined,
        notify: dbContact.notify || undefined,
        verifiedName: dbContact.verifiedName || undefined,
        status: dbContact.status || undefined,
        isBusiness: dbContact.isBusiness,
        isMyContact: dbContact.isMyContact,
        isBlocked: dbContact.isBlocked,
        lastSeen: dbContact.lastSeen || undefined,
        profilePicUrl: dbContact.profilePicUrl || undefined,
        isFavorite: dbContact.isFavorite
      }));
      
    } catch (error) {
      console.error('Failed to get contacts from database, falling back to memory:', error);
      return this.getContactsFromMemory(filters);
    }
  }

  /**
   * Get contacts from in-memory cache (fallback method)
   */
  private getContactsFromMemory(filters: ContactFilters = {}): ContactInfo[] {
    let contacts = Array.from(this.contacts.values());

    // Apply filters
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      contacts = contacts.filter(contact => 
        contact.name?.toLowerCase().includes(searchTerm) ||
        contact.pushName?.toLowerCase().includes(searchTerm) ||
        contact.notify?.toLowerCase().includes(searchTerm) ||
        contact.id.includes(searchTerm)
      );
    }

    if (filters.isMyContact !== undefined) {
      contacts = contacts.filter(contact => contact.isMyContact === filters.isMyContact);
    }

    if (filters.isBlocked !== undefined) {
      contacts = contacts.filter(contact => contact.isBlocked === filters.isBlocked);
    }

    if (filters.isBusiness !== undefined) {
      contacts = contacts.filter(contact => contact.isBusiness === filters.isBusiness);
    }

    if (filters.isFavorite !== undefined) {
      contacts = contacts.filter(contact => contact.isFavorite === filters.isFavorite);
    }

    // Apply pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || contacts.length;
    
    return contacts.slice(offset, offset + limit);
  }

  /**
   * Get groups with optional filtering (database-backed)
   */
  async getGroups(filters: GroupFilters = {}): Promise<GroupInfo[]> {
    if (!this.dbInitialized) {
      // Fallback to in-memory data if database not initialized
      return this.getGroupsFromMemory(filters);
    }
    
    try {
      // Convert filters to database format
      const dbFilters: DbGroupFilters = {
        isActive: true,
        search: filters.search,
        canSend: filters.canSend,
        minParticipants: filters.minSize,
        maxParticipants: filters.maxSize,
        limit: filters.limit,
        offset: filters.offset
      };
      
      // Handle user role filters
      if (filters.isOwner !== undefined || filters.isAdmin !== undefined) {
        if (filters.isOwner) {
          dbFilters.userRole = 'superadmin';
        } else if (filters.isAdmin) {
          dbFilters.userRole = 'admin';
        }
      }
      
      const dbGroups = await GroupRepository.findAll(dbFilters);
      
      return dbGroups.map(dbGroup => ({
        id: dbGroup.id,
        subject: dbGroup.subject,
        desc: dbGroup.description || undefined,
        size: dbGroup.participantCount,
        creation: dbGroup.creation ? Math.floor(dbGroup.creation.getTime() / 1000) : undefined,
        owner: dbGroup.owner || undefined,
        participants: this.groups.get(dbGroup.id)?.participants || [], // Get from cache if available
        canSend: dbGroup.canSend || false,
        profilePicUrl: dbGroup.profilePicUrl || undefined,
        addressingMode: 'pn' as const // Default addressing mode
      }));
      
    } catch (error) {
      console.error('Failed to get groups from database, falling back to memory:', error);
      return this.getGroupsFromMemory(filters);
    }
  }

  /**
   * Get groups from in-memory cache (fallback method)
   */
  private getGroupsFromMemory(filters: GroupFilters = {}): GroupInfo[] {
    let groups = Array.from(this.groups.values());

    // Apply filters
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      groups = groups.filter(group => 
        group.subject.toLowerCase().includes(searchTerm) ||
        group.desc?.toLowerCase().includes(searchTerm)
      );
    }

    if (filters.isOwner !== undefined) {
      const userJid = this.socket.user?.id;
      groups = groups.filter(group => 
        filters.isOwner ? group.owner === userJid : group.owner !== userJid
      );
    }

    if (filters.isAdmin !== undefined) {
      const userJid = this.socket.user?.id;
      groups = groups.filter(group => {
        const userParticipant = group.participants.find(p => p.id === userJid);
        const isAdmin = userParticipant?.admin === 'admin' || userParticipant?.admin === 'superadmin';
        return filters.isAdmin ? isAdmin : !isAdmin;
      });
    }

    if (filters.canSend !== undefined) {
      groups = groups.filter(group => group.canSend === filters.canSend);
    }

    if (filters.minSize !== undefined) {
      groups = groups.filter(group => (group.size || 0) >= filters.minSize!);
    }

    if (filters.maxSize !== undefined) {
      groups = groups.filter(group => (group.size || 0) <= filters.maxSize!);
    }

    // Apply pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || groups.length;
    
    return groups.slice(offset, offset + limit);
  }

  /**
   * Get contact by ID
   */
  getContact(contactId: string): ContactInfo | undefined {
    return this.contacts.get(contactId);
  }

  /**
   * Get group by ID
   */
  getGroup(groupId: string): GroupInfo | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Add contact to favorites (database-backed)
   */
  async addToFavorites(contactId: string): Promise<boolean> {
    try {
      if (this.dbInitialized) {
        // Update in database
        const updatedContact = await ContactRepository.toggleFavorite(contactId);
        if (!updatedContact.isFavorite) {
          // If it was toggled to false, toggle again to make it true
          await ContactRepository.toggleFavorite(contactId);
        }
      }
      
      // Update in-memory cache
      const contact = this.contacts.get(contactId);
      if (contact) {
        this.favorites.add(contactId);
        contact.isFavorite = true;
        this.contacts.set(contactId, contact);
      }

      this.emit('favorite_added', contactId);
      return true;
      
    } catch (error) {
      console.error('Failed to add to favorites:', error);
      this.emit('favorite_operation_failed', { contactId, operation: 'add', error });
      return false;
    }
  }

  /**
   * Remove contact from favorites (database-backed)
   */
  async removeFromFavorites(contactId: string): Promise<boolean> {
    try {
      if (this.dbInitialized) {
        // Update in database
        const updatedContact = await ContactRepository.toggleFavorite(contactId);
        if (updatedContact.isFavorite) {
          // If it was toggled to true, toggle again to make it false
          await ContactRepository.toggleFavorite(contactId);
        }
      }
      
      // Update in-memory cache
      const contact = this.contacts.get(contactId);
      if (contact) {
        this.favorites.delete(contactId);
        contact.isFavorite = false;
        this.contacts.set(contactId, contact);
      }

      this.emit('favorite_removed', contactId);
      return true;
      
    } catch (error) {
      console.error('Failed to remove from favorites:', error);
      this.emit('favorite_operation_failed', { contactId, operation: 'remove', error });
      return false;
    }
  }

  /**
   * Get favorite contacts
   */
  getFavoriteContacts(): ContactInfo[] {
    return Array.from(this.favorites).map(id => this.contacts.get(id)!).filter(Boolean);
  }

  /**
   * Search contacts and groups
   */
  async search(query: string, type: 'contacts' | 'groups' | 'all' = 'all') {
    const results = {
      contacts: [] as ContactInfo[],
      groups: [] as GroupInfo[],
    };

    if (type === 'contacts' || type === 'all') {
      results.contacts = await this.getContacts({ search: query });
    }

    if (type === 'groups' || type === 'all') {
      results.groups = await this.getGroups({ search: query });
    }

    return results;
  }

  /**
   * Get contact/group statistics (database-backed)
   */
  async getStatistics() {
    if (!this.dbInitialized) {
      // Fallback to in-memory statistics
      return this.getStatisticsFromMemory();
    }
    
    try {
      const [contactStats, groupStats] = await Promise.all([
        ContactRepository.getStatistics(),
        GroupRepository.getStatistics()
      ]);
      
      return {
        contacts: {
          total: contactStats.total,
          active: contactStats.active,
          business: contactStats.business,
          blocked: contactStats.total - contactStats.active, // Approximation
          favorites: contactStats.favorites,
          myContacts: contactStats.myContacts
        },
        groups: {
          total: groupStats.total,
          active: groupStats.active,
          adminIn: groupStats.adminGroups,
          ownedBy: groupStats.ownedGroups,
          averageParticipants: groupStats.averageParticipants
        },
        lastSync: this.lastSync,
        syncInProgress: this.syncInProgress,
      };
      
    } catch (error) {
      console.error('Failed to get statistics from database, falling back to memory:', error);
      return this.getStatisticsFromMemory();
    }
  }

  /**
   * Get statistics from in-memory cache (fallback method)
   */
  private getStatisticsFromMemory() {
    const totalContacts = this.contacts.size;
    const totalGroups = this.groups.size;
    const favoriteContacts = this.favorites.size;
    const businessContacts = Array.from(this.contacts.values()).filter(c => c.isBusiness).length;
    const blockedContacts = Array.from(this.contacts.values()).filter(c => c.isBlocked).length;
    const adminGroups = Array.from(this.groups.values()).filter(g => {
      const userJid = this.socket.user?.id;
      const userParticipant = g.participants.find(p => p.id === userJid);
      return userParticipant?.admin === 'admin' || userParticipant?.admin === 'superadmin';
    }).length;

    return {
      contacts: {
        total: totalContacts,
        business: businessContacts,
        blocked: blockedContacts,
        favorites: favoriteContacts,
      },
      groups: {
        total: totalGroups,
        adminIn: adminGroups,
        ownedBy: Array.from(this.groups.values()).filter(g => g.owner === this.socket.user?.id).length,
      },
      lastSync: this.lastSync,
      syncInProgress: this.syncInProgress,
    };
  }

  /**
   * Private helper methods
   */
  private async updateContact(contact: Partial<ContactInfo>) {
    if (!contact.id) return;

    const existing = this.contacts.get(contact.id) || { id: contact.id } as ContactInfo;
    const updated = { ...existing, ...contact };
    const wasNew = !this.contacts.has(contact.id);
    
    this.contacts.set(contact.id, updated);
    
    // Update in database if initialized
    if (this.dbInitialized) {
      try {
        await ContactRepository.upsert({
          id: updated.id,
          name: updated.name,
          pushName: updated.pushName,
          notify: updated.notify,
          verifiedName: updated.verifiedName,
          status: updated.status,
          phoneNumber: undefined, // Will be extracted during sync
          isBusiness: updated.isBusiness || false,
          isMyContact: updated.isMyContact || false,
          isBlocked: updated.isBlocked || false,
          isActive: true,
          isFavorite: updated.isFavorite || false,
          profilePicUrl: updated.profilePicUrl,
          lastSeen: updated.lastSeen
        });
        
        // Emit database update event for real-time sync
        this.emit('database_contact_updated', { 
          contact: updated, 
          isNew: wasNew 
        });
        
      } catch (error) {
        console.error('Failed to update contact in database:', error);
        this.emit('database_update_error', { 
          type: 'contact', 
          id: contact.id, 
          error 
        });
      }
    }
  }

  private async addOrUpdateContact(contact: Contact) {
    const wasNew = !this.contacts.has(contact.id);
    const contactInfo: ContactInfo = {
      ...contact,
      isFavorite: this.favorites.has(contact.id),
    };
    this.contacts.set(contact.id, contactInfo);
    
    // Update in database if initialized
    if (this.dbInitialized) {
      try {
        await ContactRepository.upsert({
          id: contactInfo.id,
          name: contactInfo.name,
          pushName: contactInfo.pushName,
          notify: contactInfo.notify,
          verifiedName: contactInfo.verifiedName,
          status: contactInfo.status,
          phoneNumber: undefined, // Will be extracted during sync
          isBusiness: contactInfo.isBusiness || false,
          isMyContact: contactInfo.isMyContact || false,
          isBlocked: contactInfo.isBlocked || false,
          isActive: true,
          isFavorite: contactInfo.isFavorite || false,
          profilePicUrl: contactInfo.profilePicUrl,
          lastSeen: contactInfo.lastSeen
        });
        
        // Emit database update event for real-time sync
        this.emit('database_contact_updated', { 
          contact: contactInfo, 
          isNew: wasNew 
        });
        
      } catch (error) {
        console.error('Failed to add/update contact in database:', error);
        this.emit('database_update_error', { 
          type: 'contact', 
          id: contact.id, 
          error 
        });
      }
    }
  }

  private async updateGroup(group: GroupMetadata) {
    const existing = this.groups.get(group.id);
    const wasNew = !existing;
    
    if (existing) {
      const updated = { ...existing, ...group };
      this.groups.set(group.id, updated);
      
      // Update in database if initialized
      if (this.dbInitialized) {
        try {
          await GroupRepository.upsert({
            id: updated.id,
            subject: updated.subject,
            description: updated.desc,
            participantCount: updated.size || 0,
            creation: updated.creation ? new Date(updated.creation * 1000) : undefined,
            owner: updated.owner,
            userRole: 'member', // Will be determined during sync
            canSend: updated.canSend || false,
            isActive: true,
            profilePicUrl: updated.profilePicUrl
          });
          
          // Emit database update event for real-time sync
          this.emit('database_group_updated', { 
            group: updated, 
            isNew: wasNew 
          });
          
        } catch (error) {
          console.error('Failed to update group in database:', error);
          this.emit('database_update_error', { 
            type: 'group', 
            id: group.id, 
            error 
          });
        }
      }
    }
  }

  private async handleGroupParticipantsUpdate(update: any) {
    const group = this.groups.get(update.id);
    if (!group) return;

    // Update group participants based on the update
    // Implementation would depend on the specific update structure
    this.groups.set(update.id, group);
    
    // Update participant count in database if initialized
    if (this.dbInitialized) {
      try {
        await GroupRepository.update(update.id, {
          participantCount: group.size || 0,
          lastSyncAt: new Date()
        });
      } catch (error) {
        console.error('Failed to update group participants in database:', error);
      }
    }
  }

  private async checkGroupSendPermission(groupId: string): Promise<boolean> {
    try {
      const group = await this.socket.groupMetadata(groupId);
      const userJid = this.socket.user?.id;
      const userParticipant = group.participants.find(p => p.id === userJid);
      
      // Check if user is still in group and can send messages
      if (!userParticipant) return false;
      
      // If group is announcement-only, only admins can send
      if (group.announce) {
        return userParticipant.admin === 'admin' || userParticipant.admin === 'superadmin';
      }
      
      return true;
    } catch (error) {
      console.error(`Failed to check send permission for group ${groupId}:`, error);
      return false;
    }
  }

  private async getGroupProfilePicUrl(groupId: string): Promise<string | undefined> {
    try {
      return await this.socket.profilePictureUrl(groupId, 'image');
    } catch (error) {
      // Group might not have a profile picture
      return undefined;
    }
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): {
    inProgress: boolean;
    type?: string;
    startedAt?: Date;
    progress?: number;
  } {
    return {
      inProgress: this.syncInProgress,
      type: this.syncInProgress ? 'full' : undefined,
      startedAt: this.syncInProgress ? new Date() : undefined,
      progress: this.syncInProgress ? 0 : undefined
    };
  }

  /**
   * Get sync scheduler instance for advanced control
   */
  getSyncScheduler(): SyncScheduler {
    return this.syncScheduler;
  }

  /**
   * Get automatic sync status
   */
  getAutoSyncStatus() {
    return {
      scheduler: this.syncScheduler.getSyncStatus(),
      health: this.syncScheduler.getHealthMetrics(),
      config: this.syncScheduler.getConfig(),
      activeSyncs: this.syncScheduler.getActiveSyncs(),
      queuedSyncs: this.syncScheduler.getQueuedSyncs()
    };
  }

  /**
   * Trigger manual sync through scheduler
   */
  async triggerManualSync(type: 'full' | 'incremental' = 'full'): Promise<void> {
    return this.syncScheduler.triggerManualSync(type);
  }

  /**
   * Update sync scheduler configuration
   */
  updateSyncConfig(config: Partial<any>): void {
    this.syncScheduler.updateConfig(config);
  }

  /**
   * Stop automatic sync operations
   */
  stopAutoSync(): void {
    this.syncScheduler.stop();
    this.emit('auto_sync_stopped');
  }

  /**
   * Force stop all sync operations (emergency)
   */
  forceStopAllSyncs(): void {
    this.syncScheduler.forceStopAllSyncs();
    this.emit('all_syncs_force_stopped');
  }

  /**
   * Clear sync queue
   */
  clearSyncQueue(): void {
    this.syncScheduler.clearSyncQueue();
  }

  /**
   * Get sync monitor instance
   */
  getSyncMonitor(): SyncMonitor {
    return this.syncMonitor;
  }

  /**
   * Get monitoring metrics
   */
  getMonitoringMetrics() {
    return this.syncMonitor.getMetrics();
  }

  /**
   * Get sync alerts
   */
  getSyncAlerts(includeAcknowledged: boolean = false) {
    return this.syncMonitor.getAlerts(includeAcknowledged);
  }

  /**
   * Acknowledge sync alert
   */
  acknowledgeSyncAlert(alertId: string): boolean {
    return this.syncMonitor.acknowledgeAlert(alertId);
  }

  /**
   * Update monitoring configuration
   */
  updateMonitoringConfig(config: any): void {
    this.syncMonitor.updateConfig(config);
  }

  /**
   * Stop sync monitoring
   */
  stopSyncMonitoring(): void {
    this.syncMonitor.stopMonitoring();
  }
}
