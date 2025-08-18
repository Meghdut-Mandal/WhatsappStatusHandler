import { WASocket, GroupMetadata, isJidGroup, jidNormalizedUser } from '@whiskeysockets/baileys';
import { EventEmitter } from 'events';
import { GroupRepository, CreateGroupData } from '../db/group';

export interface SyncedGroup {
  id: string;
  subject: string;
  description?: string;
  participantCount: number;
  creation?: Date;
  owner?: string;
  userRole?: 'member' | 'admin' | 'superadmin';
  canSend?: boolean;
  profilePicUrl?: string;
}

export interface GroupSyncResult {
  groups: SyncedGroup[];
  totalSynced: number;
  newGroups: number;
  updatedGroups: number;
  errors: GroupSyncError[];
}

export interface GroupSyncError {
  groupId: string;
  operation: 'fetch' | 'enrich' | 'save';
  error: string;
}

export class GroupSyncService extends EventEmitter {
  private socket: WASocket;
  private syncedGroups: Map<string, SyncedGroup> = new Map();

  constructor(socket: WASocket) {
    super();
    this.socket = socket;
  }

  /**
   * Fetch all groups using Baileys groupFetchAllParticipating API
   */
  async fetchAllGroups(): Promise<SyncedGroup[]> {
    this.emit('group_fetch_started');
    
    try {
      const groups = await this.socket.groupFetchAllParticipating();
      const syncedGroups: SyncedGroup[] = [];
      
      for (const [groupId, groupMetadata] of Object.entries(groups)) {
        if (isJidGroup(groupId)) {
          const syncedGroup = await this.convertGroupMetadata(groupId, groupMetadata);
          if (syncedGroup) {
            syncedGroups.push(syncedGroup);
            this.syncedGroups.set(groupId, syncedGroup);
          }
        }
      }
      
      this.emit('group_fetch_completed', { 
        total: syncedGroups.length,
        groupIds: syncedGroups.map(g => g.id)
      });
      
      return syncedGroups;
      
    } catch (error) {
      this.emit('group_fetch_error', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Enrich group metadata with profile pictures
   */
  async enrichGroupMetadata(groups: SyncedGroup[]): Promise<SyncedGroup[]> {
    this.emit('group_enrichment_started', { count: groups.length });
    
    const enrichedGroups: SyncedGroup[] = [];
    const errors: GroupSyncError[] = [];
    
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      
      try {
        const enriched = await this.enrichSingleGroup(group);
        enrichedGroups.push(enriched);
        
        this.emit('group_enrichment_progress', { 
          processed: i + 1, 
          total: groups.length,
          groupId: group.id
        });
        
        // Add small delay to avoid rate limiting
        if (i % 5 === 0 && i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        errors.push({
          groupId: group.id,
          operation: 'enrich',
          error: error instanceof Error ? error.message : 'Unknown enrichment error'
        });
        
        // Still add the group without enrichment
        enrichedGroups.push(group);
      }
    }
    
    if (errors.length > 0) {
      this.emit('group_enrichment_errors', errors);
    }
    
    this.emit('group_enrichment_completed', { 
      total: enrichedGroups.length, 
      errors: errors.length 
    });
    
    return enrichedGroups;
  }

  /**
   * Detect user role in each group (member, admin, owner)
   */
  detectUserRole(groupMetadata: GroupMetadata, userJid?: string): 'member' | 'admin' | 'superadmin' {
    if (!userJid) {
      userJid = this.socket.user?.id;
    }
    
    if (!userJid) {
      return 'member';
    }
    
    const normalizedUserJid = jidNormalizedUser(userJid);
    
    // Check if user is the owner (creator)
    if (groupMetadata.owner === normalizedUserJid) {
      return 'superadmin';
    }
    
    // Check if user is an admin
    const userParticipant = groupMetadata.participants.find(
      p => jidNormalizedUser(p.id) === normalizedUserJid
    );
    
    if (userParticipant?.admin === 'admin') {
      return 'admin';
    }
    
    if (userParticipant?.admin === 'superadmin') {
      return 'superadmin';
    }
    
    return 'member';
  }

  /**
   * Check if user can send messages to the group
   */
  async checkSendPermission(groupId: string, userRole: string): Promise<boolean> {
    try {
      const groupMetadata = await this.socket.groupMetadata(groupId);
      
      // If group is announcement-only, only admins can send
      if (groupMetadata.announce) {
        return userRole === 'admin' || userRole === 'superadmin';
      }
      
      // Check if user is still in the group
      const userJid = this.socket.user?.id;
      if (!userJid) return false;
      
      const normalizedUserJid = jidNormalizedUser(userJid);
      const userParticipant = groupMetadata.participants.find(
        p => jidNormalizedUser(p.id) === normalizedUserJid
      );
      
      return !!userParticipant;
      
    } catch (error) {
      console.warn(`Failed to check send permission for group ${groupId}:`, error);
      return false;
    }
  }

  /**
   * Perform full group sync with enrichment
   */
  async syncAllGroups(): Promise<GroupSyncResult> {
    const startTime = Date.now();
    this.emit('full_sync_started');
    
    try {
      // Fetch all groups
      const groups = await this.fetchAllGroups();
      
      // Enrich group metadata
      const enrichedGroups = await this.enrichGroupMetadata(groups);
      
      // Save to database
      const saveResult = await this.saveGroupsToDatabase(enrichedGroups);
      
      const result: GroupSyncResult = {
        groups: enrichedGroups,
        totalSynced: enrichedGroups.length,
        newGroups: saveResult.newGroups,
        updatedGroups: saveResult.updatedGroups,
        errors: saveResult.errors
      };
      
      const duration = Date.now() - startTime;
      this.emit('full_sync_completed', { ...result, duration });
      
      return result;
      
    } catch (error) {
      this.emit('full_sync_failed', error);
      throw error;
    }
  }

  /**
   * Handle real-time group updates
   */
  setupGroupEventListeners(): void {
    // Listen for group updates
    this.socket.ev.on('groups.update', async (updates) => {
      for (const update of updates) {
        try {
          await this.handleGroupUpdate(update);
        } catch (error) {
          this.emit('group_update_error', { 
            groupId: update.id, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }
    });

    // Listen for group participant updates
    this.socket.ev.on('group-participants.update', async (update) => {
      try {
        await this.handleParticipantUpdate(update);
      } catch (error) {
        this.emit('participant_update_error', { 
          groupId: update.id, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });
  }

  /**
   * Private helper methods
   */
  private async convertGroupMetadata(groupId: string, metadata: GroupMetadata): Promise<SyncedGroup | null> {
    try {
      const userRole = this.detectUserRole(metadata);
      const canSend = await this.checkSendPermission(groupId, userRole);
      
      const syncedGroup: SyncedGroup = {
        id: groupId,
        subject: metadata.subject,
        description: metadata.desc,
        participantCount: metadata.participants.length,
        creation: metadata.creation ? new Date(metadata.creation * 1000) : undefined,
        owner: metadata.owner ? jidNormalizedUser(metadata.owner) : undefined,
        userRole,
        canSend
      };
      
      return syncedGroup;
    } catch (error) {
      console.warn(`Failed to convert group metadata for ${groupId}:`, error);
      return null;
    }
  }

  private async enrichSingleGroup(group: SyncedGroup): Promise<SyncedGroup> {
    const enriched = { ...group };
    
    try {
      // Get group profile picture URL
      try {
        enriched.profilePicUrl = await this.socket.profilePictureUrl(group.id, 'image');
      } catch (error) {
        // Group might not have a profile picture
        enriched.profilePicUrl = undefined;
      }
      
      // Refresh group metadata to get latest info
      try {
        const latestMetadata = await this.socket.groupMetadata(group.id);
        enriched.subject = latestMetadata.subject;
        enriched.description = latestMetadata.desc;
        enriched.participantCount = latestMetadata.participants.length;
        enriched.userRole = this.detectUserRole(latestMetadata);
        enriched.canSend = await this.checkSendPermission(group.id, enriched.userRole);
      } catch (error) {
        // If we can't get latest metadata, keep existing data
        console.warn(`Failed to refresh metadata for group ${group.id}:`, error);
      }
      
    } catch (error) {
      console.warn(`Failed to enrich group ${group.id}:`, error);
    }
    
    return enriched;
  }

  private async saveGroupsToDatabase(groups: SyncedGroup[]): Promise<{
    newGroups: number;
    updatedGroups: number;
    errors: GroupSyncError[];
  }> {
    let newGroups = 0;
    let updatedGroups = 0;
    const errors: GroupSyncError[] = [];
    
    for (const group of groups) {
      try {
        const existingGroup = await GroupRepository.findById(group.id);
        
        const groupData: CreateGroupData = {
          id: group.id,
          subject: group.subject,
          description: group.description,
          participantCount: group.participantCount,
          creation: group.creation,
          owner: group.owner,
          userRole: group.userRole,
          canSend: group.canSend || false,
          isActive: true,
          profilePicUrl: group.profilePicUrl
        };
        
        await GroupRepository.upsert(groupData);
        
        if (existingGroup) {
          updatedGroups++;
        } else {
          newGroups++;
        }
        
      } catch (error) {
        errors.push({
          groupId: group.id,
          operation: 'save',
          error: error instanceof Error ? error.message : 'Unknown save error'
        });
      }
    }
    
    return { newGroups, updatedGroups, errors };
  }

  private async handleGroupUpdate(update: any): Promise<void> {
    if (!update.id || !isJidGroup(update.id)) return;
    
    try {
      // Get fresh group metadata
      const metadata = await this.socket.groupMetadata(update.id);
      const syncedGroup = await this.convertGroupMetadata(update.id, metadata);
      
      if (syncedGroup) {
        const enriched = await this.enrichSingleGroup(syncedGroup);
        await this.saveGroupsToDatabase([enriched]);
        
        this.emit('group_updated', enriched);
      }
    } catch (error) {
      console.warn(`Failed to handle group update for ${update.id}:`, error);
    }
  }

  private async handleParticipantUpdate(update: any): Promise<void> {
    if (!update.id || !isJidGroup(update.id)) return;
    
    try {
      // Get fresh group metadata to update participant count and user role
      const metadata = await this.socket.groupMetadata(update.id);
      const syncedGroup = await this.convertGroupMetadata(update.id, metadata);
      
      if (syncedGroup) {
        await this.saveGroupsToDatabase([syncedGroup]);
        
        this.emit('group_participants_updated', {
          groupId: update.id,
          participantCount: syncedGroup.participantCount,
          userRole: syncedGroup.userRole
        });
      }
    } catch (error) {
      console.warn(`Failed to handle participant update for ${update.id}:`, error);
    }
  }
}