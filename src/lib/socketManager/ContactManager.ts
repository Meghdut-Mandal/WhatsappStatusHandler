import { WASocket, Contact, GroupMetadata } from '@whiskeysockets/baileys';
import { EventEmitter } from 'events';

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

  constructor(socket: WASocket) {
    super();
    this.socket = socket;
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for contact/group updates
   */
  private setupEventHandlers() {
    this.socket.ev.on('contacts.update', (updates) => {
      for (const contact of updates) {
        this.updateContact(contact);
      }
      this.emit('contacts_updated', updates);
    });

    this.socket.ev.on('contacts.upsert', (contacts) => {
      for (const contact of contacts) {
        this.addOrUpdateContact(contact);
      }
      this.emit('contacts_added', contacts);
    });

    this.socket.ev.on('groups.update', (updates) => {
      for (const group of updates) {
        this.updateGroup(group as GroupMetadata);
      }
      this.emit('groups_updated', updates);
    });

    this.socket.ev.on('group-participants.update', (update) => {
      this.handleGroupParticipantsUpdate(update);
      this.emit('group_participants_updated', update);
    });
  }

  /**
   * Sync contacts and groups from WhatsApp
   */
  async syncAll(force: boolean = false): Promise<{ contacts: number; groups: number }> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    // Check if recent sync exists and force is not requested
    if (!force && this.lastSync && Date.now() - this.lastSync.getTime() < 5 * 60 * 1000) {
      throw new Error('Recent sync exists. Use force=true to override');
    }

    this.syncInProgress = true;
    this.emit('sync_started');

    try {
      const [contactsCount, groupsCount] = await Promise.all([
        this.syncContacts(),
        this.syncGroups()
      ]);

      this.lastSync = new Date();
      this.syncInProgress = false;
      this.emit('sync_completed', { contacts: contactsCount, groups: groupsCount });

      return { contacts: contactsCount, groups: groupsCount };

    } catch (error) {
      this.syncInProgress = false;
      this.emit('sync_failed', error);
      throw error;
    }
  }

  /**
   * Sync contacts from WhatsApp
   */
  async syncContacts(): Promise<number> {
    try {
      // Note: Baileys doesn't have a direct contacts API
      // This would typically be built from message history or presence updates
      // For now, we'll simulate the process
      
      this.emit('contacts_sync_started');
      
      // In a real implementation, you would:
      // 1. Query chat history to extract unique contacts
      // 2. Get presence/profile info for each contact
      // 3. Build contact database
      
      const contactsCount = this.contacts.size;
      this.emit('contacts_sync_completed', contactsCount);
      
      return contactsCount;

    } catch (error) {
      console.error('Failed to sync contacts:', error);
      this.emit('contacts_sync_failed', error);
      throw error;
    }
  }

  /**
   * Sync groups from WhatsApp
   */
  async syncGroups(): Promise<number> {
    try {
      this.emit('groups_sync_started');
      
      const groups = await this.socket.groupFetchAllParticipating();
      
      for (const [groupId, group] of Object.entries(groups)) {
        const groupInfo: GroupInfo = {
          ...group,
          id: groupId,
          canSend: await this.checkGroupSendPermission(groupId),
          profilePicUrl: await this.getGroupProfilePicUrl(groupId),
        };
        
        this.groups.set(groupId, groupInfo);
      }

      const groupsCount = this.groups.size;
      this.emit('groups_sync_completed', groupsCount);
      
      return groupsCount;

    } catch (error) {
      console.error('Failed to sync groups:', error);
      this.emit('groups_sync_failed', error);
      throw error;
    }
  }

  /**
   * Get contacts with optional filtering
   */
  getContacts(filters: ContactFilters = {}): ContactInfo[] {
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
   * Get groups with optional filtering
   */
  getGroups(filters: GroupFilters = {}): GroupInfo[] {
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
   * Add contact to favorites
   */
  async addToFavorites(contactId: string): Promise<boolean> {
    const contact = this.contacts.get(contactId);
    if (!contact) return false;

    this.favorites.add(contactId);
    contact.isFavorite = true;
    this.contacts.set(contactId, contact);

    this.emit('favorite_added', contactId);
    return true;
  }

  /**
   * Remove contact from favorites
   */
  async removeFromFavorites(contactId: string): Promise<boolean> {
    const contact = this.contacts.get(contactId);
    if (!contact) return false;

    this.favorites.delete(contactId);
    contact.isFavorite = false;
    this.contacts.set(contactId, contact);

    this.emit('favorite_removed', contactId);
    return true;
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
  search(query: string, type: 'contacts' | 'groups' | 'all' = 'all') {
    const results = {
      contacts: [] as ContactInfo[],
      groups: [] as GroupInfo[],
    };

    if (type === 'contacts' || type === 'all') {
      results.contacts = this.getContacts({ search: query });
    }

    if (type === 'groups' || type === 'all') {
      results.groups = this.getGroups({ search: query });
    }

    return results;
  }

  /**
   * Get contact/group statistics
   */
  getStatistics() {
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
  private updateContact(contact: Partial<ContactInfo>) {
    if (!contact.id) return;

    const existing = this.contacts.get(contact.id) || { id: contact.id } as ContactInfo;
    const updated = { ...existing, ...contact };
    this.contacts.set(contact.id, updated);
  }

  private addOrUpdateContact(contact: Contact) {
    const contactInfo: ContactInfo = {
      ...contact,
      isFavorite: this.favorites.has(contact.id),
    };
    this.contacts.set(contact.id, contactInfo);
  }

  private updateGroup(group: GroupMetadata) {
    const existing = this.groups.get(group.id);
    if (existing) {
      const updated = { ...existing, ...group };
      this.groups.set(group.id, updated);
    }
  }

  private handleGroupParticipantsUpdate(update: any) {
    const group = this.groups.get(update.id);
    if (!group) return;

    // Update group participants based on the update
    // Implementation would depend on the specific update structure
    this.groups.set(update.id, group);
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
}
